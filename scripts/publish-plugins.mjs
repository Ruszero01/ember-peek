import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import semver from "semver";
import { root, target, catalogKey, packagesKey, ossConfig, releaseDirectory } from "./oss-config.mjs";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const immutable = { "Cache-Control": "public, max-age=31536000, immutable", "x-oss-forbid-overwrite": "true" };

function checkEntry(entry) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(entry.id || "") || !semver.valid(entry.version) || semver.prerelease(entry.version)) throw new Error("stable 目录需要有效插件 ID 和正式 SemVer 版本");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*\.zip$/.test(entry.artifact || "") || entry.artifact.length > 200) throw new Error(`非法包名：${entry.id}`);
  if (!/^[a-f0-9]{64}$/.test(entry.sha256 || "") || !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > 64 * 1024 * 1024) throw new Error(`非法包哈希或大小：${entry.id}`);
  if (!/^[a-f0-9]{64}$/.test(entry.buildId || "") || JSON.stringify(entry.targets) !== JSON.stringify([target])) throw new Error(`非法构建或目标平台：${entry.id}`);
}

export function checkCatalog(catalog) {
  if (catalog?.api !== 1 || catalog.signature != null || !Array.isArray(catalog.entries) || !catalog.entries.length || catalog.entries.length > 256) throw new Error("无效发布目录");
  const ids = new Set();
  for (const entry of catalog.entries) {
    checkEntry(entry);
    if (ids.has(entry.id)) throw new Error(`重复插件 ID：${entry.id}`);
    ids.add(entry.id);
  }
}

export function checkInputs(inputs, catalog, bytes) {
  if (inputs?.api !== 1 || inputs.target !== target || inputs.catalogSha256 !== sha256(bytes)) throw new Error("release-inputs.json 与目录不匹配，请重新运行 plugins:dist");
  for (const entry of catalog.entries) {
    if (!/^[a-f0-9]{64}$/.test(inputs.inputs?.[entry.id] || "")) throw new Error(`缺少源码指纹：${entry.id}`);
  }
}

async function get(store, key) {
  try { return Buffer.from((await store.get(key)).content); }
  catch (error) { if (error.code === "NoSuchKey") return null; throw error; }
}

function verify(bytes, entry) {
  if (!bytes || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error(`包校验失败：${entry.id} ${entry.version}`);
}

export async function anonymousGet(url, expectedSize) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: "error", headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`公开下载不可用：HTTP ${response.status} ${url}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > expectedSize) throw new Error(`公开下载超过预期大小：${url}`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// All reads/decisions are completed before writes. The returned catalog can retain the
// original archive when a no-op rebuild changed only the linker's timestamp.
export async function planRelease({ store, config, catalog, inputs, readArtifact, replaceBaseline = false }) {
  checkCatalog(catalog);
  if (inputs?.api !== 1 || inputs.target !== target) throw new Error("缺少有效的 release-inputs.json，请运行 plugins:dist");
  const previousBytes = await get(store, config.key(catalogKey));
  const previous = previousBytes ? JSON.parse(previousBytes) : null;
  if (previous) checkCatalog(previous);
  if (replaceBaseline && [...catalog.entries, ...(previous?.entries || [])].some(entry => entry.version !== "0.1.0")) {
    throw new Error("基线覆盖仅允许全部插件保持 0.1.0，不能重置已升级的正式版本");
  }
  const entries = [], packages = [], records = [];
  for (const candidate of catalog.entries) {
    const sourceDigest = inputs.inputs?.[candidate.id];
    if (!/^[a-f0-9]{64}$/.test(sourceDigest || "")) throw new Error(`缺少源码指纹：${candidate.id}`);
    const prior = previous?.entries.find((entry) => entry.id === candidate.id);
    if (prior && semver.lt(candidate.version, prior.version)) throw new Error(`拒绝目录降级：${candidate.id} ${prior.version} → ${candidate.version}`);
    const recordKey = config.key(`registry/${target}/${candidate.id}/${candidate.version}.json`);
    const existing = await get(store, recordKey);
    let entry = candidate;
    if (existing) {
      const record = JSON.parse(existing);
      checkEntry(record.entry);
      if (record.entry.id !== candidate.id || record.entry.version !== candidate.version) throw new Error(`发布记录身份不匹配：${candidate.id}`);
      if (record.sourceDigest !== sourceDigest) {
        if (!replaceBaseline) throw new Error(`同版本源码已变化，请先升级 ${candidate.id} 的版本号`);
        records.push({ key: recordKey, body: json({ api: 1, sourceDigest, entry }), replace: true });
      } else {
        entry = { ...candidate, artifact: record.entry.artifact, sha256: record.entry.sha256, size: record.entry.size, buildId: record.entry.buildId };
      }
    } else {
      if (prior && semver.eq(candidate.version, prior.version) && !replaceBaseline) throw new Error(`已有版本缺少发布记录：${candidate.id}，请先检查 registry`);
      records.push({ key: recordKey, body: json({ api: 1, sourceDigest, entry }) });
    }
    const key = config.key(`${packagesKey}/${entry.artifact}`);
    const remote = await get(store, key);
    if (remote) verify(remote, entry);
    else {
      if (existing && !records.some(record => record.key === recordKey && record.replace)) throw new Error(`已发布版本的包丢失：${key}，请恢复原包，不能用重编译结果替换`);
      const bytes = await readArtifact(entry.artifact);
      verify(bytes, entry);
      packages.push({ key, body: bytes });
    }
    entries.push(entry);
  }
  // Removing a plugin from the index is a separate, deliberate operation, not a side
  // effect of a partial build. Initial infrastructure only publishes complete catalogs.
  for (const entry of previous?.entries || []) {
    if (!entries.some((candidate) => candidate.id === entry.id)) throw new Error(`发布目录缺少已上架插件：${entry.id}`);
  }
  const keep = new Set(entries.flatMap((entry) => [
    config.key(`${packagesKey}/${entry.artifact}`),
    config.key(`registry/${target}/${entry.id}/${entry.version}.json`),
  ]));
  const obsolete = [];
  // Only this distribution target and the retired catalog snapshots are managed here.
  for (const prefix of [config.key(`${packagesKey}/`), config.key(`registry/${target}/`), config.key('catalog-history/')]) {
    let token;
    do {
      const page = await store.listV2({ prefix, 'max-keys': 1000, ...(token ? { 'continuation-token': token } : {}) });
      for (const object of page.objects || []) {
        if (!object.name.startsWith(prefix)) throw new Error('OSS 列举结果超出清理范围');
        if (!keep.has(object.name)) obsolete.push(object.name);
      }
      const next = page.isTruncated ? page.nextContinuationToken : undefined;
      if (page.isTruncated && (!next || next === token)) throw new Error('OSS 列举分页异常');
      token = next;
    } while (token);
  }
  return { catalog: { api: 1, entries }, packages, records, obsolete };
}

export async function publishRelease({ store, config, catalog, inputs, readArtifact, apply = false, replaceBaseline = false, publicGet = anonymousGet, log = console.log }) {
  const versioning = await store.getBucketVersioning(config.bucket);
  // OSS ignores forbid-overwrite on versioned/suspended buckets. A dedicated unversioned
  // distribution bucket gives both immutable records and the publisher lock real meaning.
  if (versioning.versionStatus) throw new Error("发布桶必须从未启用版本控制；Enabled/Suspended 不支持。");
  const lock = config.key("publish.lock");
  const owner = randomUUID();
  let locked = false;
  try {
    if (apply) {
      await store.put(lock, json({ owner, at: new Date().toISOString(), run: process.env.GITHUB_RUN_ID || "local" }), { headers: { "x-oss-forbid-overwrite": "true", "Cache-Control": "no-store" } });
      locked = true;
    }
    const plan = await planRelease({ store, config, catalog, inputs, readArtifact, replaceBaseline });
    log(`${apply ? "发布" : "只读预演"}：${plan.catalog.entries.length} 个插件，上传 ${plan.packages.length} 个包，新增 ${plan.records.length} 个版本记录`);
    for (const entry of plan.catalog.entries) log(`${entry.id} ${entry.version} ${entry.artifact}`);
    log(`目录验证成功后清理 ${plan.obsolete.length} 个旧对象`);
    for (const key of plan.obsolete) log(`清理：${key}`);
    if (!apply) return plan;
    for (const item of plan.packages) await store.put(item.key, item.body, { headers: immutable, mime: "application/zip" });
    // Verify anonymous reads before advertising anything to a fresh installation.
    for (const entry of plan.catalog.entries) verify(await publicGet(`${config.base}/${packagesKey}/${entry.artifact}`, entry.size), entry);
    for (const item of plan.records) await store.put(item.key, item.body, { headers: item.replace ? { "Cache-Control": "no-store" } : immutable, mime: "application/json" });
    const body = json(plan.catalog);
    // Switch the catalog only after packages and version records are ready.
    await store.put(config.key(catalogKey), body, { headers: { "Cache-Control": "no-cache" }, mime: "application/json" });
    const publicCatalog = await publicGet(`${config.base}/${catalogKey}`, 1024 * 1024);
    if (!publicCatalog.equals(body)) throw new Error("目录已发布，但公开地址仍返回旧内容；检查 CDN 缓存后重试，勿删除已上传的包");
    // A failed cleanup leaves a valid latest catalog; retrying completes cleanup.
    for (const key of plan.obsolete) {
      try { await store.delete(key); }
      catch (error) { throw new Error(`最新目录已生效，但旧对象清理失败：${key}（${error.code || '网络错误'}）；请检查删除权限并重试发布`); }
    }
    log(`已发布：${config.base}/${catalogKey}`);
    return plan;
  } finally {
    if (locked) {
      // Never remove another publisher's lock if an operator intervened mid-run.
      const current = await get(store, lock);
      if (current && JSON.parse(current).owner === owner) await store.delete(lock);
    }
  }
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !["--apply", "--plan", "--validate", "--replace-baseline"].includes(flag)) ||
      flags.filter(flag => flag !== "--replace-baseline").length > 1 || new Set(flags).size !== flags.length ||
      (flags.includes("--validate") && flags.includes("--replace-baseline"))) {
    throw new Error("使用 --validate、--plan（默认）或 --apply；预发布基线重建可显式附加 --replace-baseline");
  }
  const validated = spawnSync("cargo", ["run", "--locked", "-p", "ember-runtime", "--features", "release-tools", "--bin", "validate-catalog", "--", releaseDirectory], { cwd: root, stdio: "inherit", windowsHide: true });
  if (validated.error || validated.status !== 0) throw new Error("插件包本地校验未通过");
  const catalogBytes = await readFile(path.join(releaseDirectory, "catalog.json"));
  const catalog = JSON.parse(catalogBytes);
  checkCatalog(catalog);
  const inputs = JSON.parse(await readFile(path.join(releaseDirectory, "release-inputs.json"), "utf8"));
  checkInputs(inputs, catalog, catalogBytes);
  if (flags.includes("--validate")) return;
  const config = ossConfig();
  for (const key of ["OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"]) if (!process.env[key]) throw new Error(`缺少 ${key}；请在本机环境或 GitHub Secrets 配置，不要写入源码`);
  const { default: OSS } = await import("ali-oss");
  const store = new OSS({ region: config.region, bucket: config.bucket, accessKeyId: process.env.OSS_ACCESS_KEY_ID, accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET, stsToken: process.env.OSS_STS_TOKEN || undefined, secure: true, timeout: 120_000 });
  await publishRelease({ store, config, catalog, inputs, apply: flags.includes("--apply"), replaceBaseline: flags.includes("--replace-baseline"), readArtifact: (name) => readFile(path.join(releaseDirectory, name)) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // SDK error objects can contain signed requests. Print only a safe code/message.
    console.error(error.code ? `OSS 操作失败：${error.code}` : error.message);
    process.exitCode = 1;
  });
}
