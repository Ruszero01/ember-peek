import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, sourceConfig } from "./oss-config.mjs";

const file = path.join(root, "src-tauri", "plugin-sources.json");
const check = process.argv.includes("--check");
try {
  if (check) {
    const actual = JSON.parse(await readFile(file, "utf8"));
    if (actual.sources?.length !== 1) throw new Error("尚未配置官方 OSS 源，请设置 OSS_PUBLIC_BASE_URL 后运行 npm run source:configure");
    const base = actual.sources[0].catalog.replace(/\/channels\/stable\/api-1\/windows-x86_64\/catalog\.json$/, "");
    const expected = sourceConfig(process.env.OSS_PUBLIC_BASE_URL || base);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("插件源配置与 OSS 地址或当前发布布局不一致，请重新运行 source:configure");
    console.log(`官方源：${actual.sources[0].catalog}`);
  } else {
    const config = sourceConfig(process.env.OSS_PUBLIC_BASE_URL);
    await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`已配置官方源：${config.sources[0].catalog}`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
