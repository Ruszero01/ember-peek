#!/usr/bin/env node
// 版本号同步：把 package.json 作为唯一来源，同步到其它 3 套工具链的权威位置，
// 再用 cargo update --workspace 让 Cargo.lock 里的 5 个工作区 crate 跟上。
//
//   node scripts/sync-version.mjs              以 package.json 为准同步其它位置，并刷新 Cargo.lock
//   node scripts/sync-version.mjs --check      只校验是否漂移，有漂移退出 1（给 CI 用）
//   node scripts/sync-version.mjs --set 0.2.0  先改 package.json 再统一
//   node scripts/sync-version.mjs --bump patch 语义化自增（patch|minor|major）再统一
//   node scripts/sync-version.mjs --skip-lock  跳过 Cargo.lock 刷新
//
// 新增插件后无需改本脚本：plugins/*/plugin.json 会被自动发现。

import { spawnSync } from "node:child_process";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

async function readJson(file) {
  const source = await readFile(file, "utf8");
  return JSON.parse(source);
}

async function editJsonVersion(file, version) {
  const source = await readFile(file, "utf8");
  const updated = replaceJsonVersion(source, version);
  if (updated !== source) await writeFile(file, updated);
  return updated !== source;
}

async function editTomlVersion(file, version) {
  const source = await readFile(file, "utf8");
  const block = /(\[workspace\.package\][^\[]*?\nversion\s*=\s*")([^"]*)(")/;
  if (!block.test(source)) throw new Error(`${file}: 找不到 [workspace.package] version`);
  const updated = source.replace(block, (_, head, _current, tail) => `${head}${version}${tail}`);
  if (updated !== source) await writeFile(file, updated);
  return updated !== source;
}

// JSON.parse 会丢格式，所以按 token 定位顶层 "version"，只替换值、保留原排版。
export function replaceJsonVersion(source, version) {
  // 必须每次新建 RegExp：带 g 标志的正则若复用，lastIndex 会跨文件残留。
  const pattern =
    /"(?:\\.|[^"\\])*"|[{}\[\],:]|\s+|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;
  const tokens = [];
  const scanner = new RegExp(pattern.source, "g");
  for (let match = scanner.exec(source); match; match = scanner.exec(source)) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  let depth = 0;
  let previous = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    if (current.text === "{") depth += 1;
    else if (current.text === "}") depth -= 1;
    else if (
      current.text === ":" &&
      depth === 1 &&
      previous &&
      previous.text === '"version"'
    ) {
      // 冒号和值之间可能有空白 token，必须跳过它再取值。
      let next = index + 1;
      while (next < tokens.length && /^\s+$/.test(tokens[next].text)) next += 1;
      const value = tokens[next];
      if (!value) throw new Error("顶层 version 后面缺少值");
      return `${source.slice(0, value.start)}"${version}"${source.slice(value.end)}`;
    }
    if (!/^\s+$/.test(current.text)) previous = current;
  }
  throw new Error("顶层找不到 version 字段");
}

/** 收集所有需要与 package.json 保持一致的版本位置。 */
async function collectTargets() {
  const targets = [
    { label: "package.json", file: "package.json", apply: editJsonVersion, source: true },
    { label: "Cargo.toml", file: "Cargo.toml", apply: editTomlVersion },
    { label: "src-tauri/tauri.conf.json", file: "src-tauri/tauri.conf.json", apply: editJsonVersion },
  ];
  const pluginsRoot = path.join(root, "plugins");
  for (const entry of await readdir(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relative = `plugins/${entry.name}/plugin.json`;
    try {
      await readJson(path.join(root, relative));
    } catch {
      continue; // 目录下没有插件清单就跳过
    }
    targets.push({ label: relative, file: relative, apply: editJsonVersion });
  }
  return targets;
}

function parseArgs(argv) {
  const options = { check: false, set: null, bump: null, skipLock: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--skip-lock") options.skipLock = true;
    else if (argument === "--set") options.set = argv[++index] ?? "";
    else if (argument === "--bump") options.bump = argv[++index] ?? "";
    else throw new Error(`未知参数 ${argument}（-h 看用法）`);
  }
  if (options.set !== null && !SEMVER.test(options.set))
    throw new Error(`--set 需要形如 0.1.0 的版本号，收到 ${options.set || "(空)"}`);
  if (options.bump !== null && !["patch", "minor", "major"].includes(options.bump))
    throw new Error(`--bump 只接受 patch|minor|major，收到 ${options.bump || "(空)"}`);
  return options;
}

function nextVersion(current, kind) {
  const [major, minor, patch] = current.split("-")[0].split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** 读取 Cargo.lock 里工作区 crate 的 name -> version（只读解析，不调用 cargo）。 */
async function readWorkspaceLockVersions() {
  const source = await readFile(path.join(root, "Cargo.lock"), "utf8");
  const versions = new Map();
  // 逐个 [[package]] 块解析：name 在版本号前面，块之间不会互相干扰。
  for (const block of source.split("[[package]]").slice(1)) {
    const end = block.indexOf("\n[");
    const body = end === -1 ? block : block.slice(0, end);
    const match = body.match(/(?:^|\n)name = "([^"]+)"\r?\n(?:(?:[^\n]*)\r?\n)*?version = "([^"]+)"/);
    if (!match) continue;
    if (match[1].startsWith("ember-")) versions.set(match[1], match[2]);
  }
  return versions;
}

function refreshLockfile() {
  // 只有 cargo update --workspace 会重写工作区 crate 的版本；
  // cargo metadata / cargo check 不会改动已存在的 Cargo.lock。
  const result = spawnSync("cargo", ["update", "--workspace", "--offline"], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
  });
  if (result.error) throw new Error(`Cargo.lock 刷新失败：${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`cargo update --workspace 退出码 ${result.status}，Cargo.lock 未同步`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targets = await collectTargets();
  const packageTarget = targets.find((target) => target.source);
  const before = (await readJson(path.join(root, packageTarget.file))).version;

  let desired = before;
  if (options.bump) desired = nextVersion(before, options.bump);
  if (options.set) desired = options.set;

  if (options.check) {
    const drifted = [];
    for (const target of targets) {
      if (target.source) continue;
      const actual = await readVersion(target);
      if (actual !== desired) drifted.push(`${target.label}: ${actual} != ${desired}`);
    }
    for (const [name, actual] of await readWorkspaceLockVersions()) {
      if (actual !== desired) drifted.push(`Cargo.lock ${name}: ${actual} != ${desired}`);
    }
    if (drifted.length) {
      console.error("版本号已漂移：");
      for (const line of drifted) console.error(`  ${line}`);
      console.error("运行 npm run version:check 查看，npm run version:set -- <版本> 修复。");
      process.exitCode = 1;
      return;
    }
    console.log(`版本号一致：${desired}`);
    return;
  }

  const changed = [];
  if (desired !== before) {
    await packageTarget.apply(path.join(root, packageTarget.file), desired);
    changed.push(`${packageTarget.label}: ${before} -> ${desired}`);
  }
  for (const target of targets) {
    if (target.source) continue;
    if (await target.apply(path.join(root, target.file), desired))
      changed.push(`${target.label}: -> ${desired}`);
  }

  if (changed.length) {
    for (const line of changed) console.log(`  ${line}`);
  } else {
    console.log(`所有位置已是 ${desired}，无改动。`);
  }

  if (!options.skipLock) {
    try {
      refreshLockfile();
      console.log("  Cargo.lock: 已刷新（cargo update --workspace）");
    } catch (error) {
      console.error(`  Cargo.lock: ${error.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`版本号统一为 ${desired}。`);
}

async function readVersion(target) {
  const file = path.join(root, target.file);
  if (target.file.endsWith(".toml")) {
    const source = await readFile(file, "utf8");
    const match = source.match(/\[workspace\.package\][^\[]*?\nversion\s*=\s*"([^"]*)"/);
    if (!match) throw new Error(`${target.file}: 找不到 [workspace.package] version`);
    return match[1];
  }
  return (await readJson(file)).version;
}

const usage = `用法：node scripts/sync-version.mjs [选项]

  --set <版本>      先把 package.json 设为该版本，再同步其它位置
  --bump <类型>     语义化自增 patch|minor|major 后再同步
  --check           只校验一致性，漂移则退出 1（CI 用），不写文件
  --skip-lock       跳过 Cargo.lock 刷新

不加选项时：以 package.json 为准，同步 Cargo.toml、tauri.conf.json、
plugins/*/plugin.json，并刷新 Cargo.lock。`;

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(usage);
} else {
  try {
    await main();
  } catch (error) {
    console.error(`错误：${error.message}`);
    console.error("");
    console.error(usage);
    process.exitCode = 1;
  }
}
