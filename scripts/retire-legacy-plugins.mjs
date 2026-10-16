import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import semver from "semver";
import { updateKey } from "./publish-desktop.mjs";
import { catalogKey, packagesKey, legacyCatalogKey, legacyPackagesKey, legacyRegistryKey, retirementKey, minimumHostVersion, ossConfig } from "./oss-config.mjs";
import { anonymousGet, checkCatalog, sha256 } from "./publish-plugins.mjs";

async function get(store, key) {
  try { return Buffer.from((await store.get(key)).content); }
  catch (error) { if (error.code === "NoSuchKey") return null; throw error; }
}

// Retirement is deliberately separate from publishing. It can run daily without a build.
export async function retireLegacy({ store, config, apply = false, now = new Date(), publicGet = anonymousGet, log = console.log }) {
  const lock = config.key("publish.lock"), owner = randomUUID();
  let locked = false;
  try {
    if (apply) {
      if ((await store.getBucketVersioning(config.bucket)).versionStatus) throw new Error("发布桶不支持版本控制");
      await store.put(lock, Buffer.from(JSON.stringify({ owner, at: now.toISOString() })),
        { headers: { "x-oss-forbid-overwrite": "true", "Cache-Control": "no-store" } });
      locked = true;
    }
    const bytes = await get(store, config.key(retirementKey));
    const marker = bytes ? JSON.parse(bytes) : null;
    if (marker) {
      const started = Date.parse(marker.startedAt), deadline = Date.parse(marker.retireAfter);
      if (marker.api !== 1 || marker.successor !== catalogKey || !Number.isFinite(started) ||
          !Number.isFinite(deadline) || deadline < started + 30 * 86400000) throw new Error("无效的旧目录退役记录");
      if (now.getTime() < deadline) { log(`旧版市场保留至 ${marker.retireAfter}`); return { retired: false, obsolete: [] }; }
    }
    // Neither a preview build nor publishing plugins before the desktop release starts
    // the grace period. Users must have a publicly downloadable stable host to upgrade to.
    const successor = await get(store, config.key(catalogKey));
    const desktopBytes = await get(store, config.key(updateKey));
    if (!successor || !desktopBytes) { log("新版宿主与插件市场尚未同时正式就绪，保留旧包"); return { retired: false, obsolete: [] }; }
    const desktop = JSON.parse(desktopBytes);
    if (desktop.api !== 1 || semver.valid(desktop.version) !== desktop.version || semver.prerelease(desktop.version) || semver.lt(desktop.version, minimumHostVersion)) {
      log("尚无兼容的正式宿主，保留旧包"); return { retired: false, obsolete: [] };
    }
    if (typeof desktop.url !== "string" || !desktop.url.startsWith(`${config.base}/desktop/`) || !/^[a-f0-9]{64}$/.test(desktop.sha256 || "") ||
        !Number.isSafeInteger(desktop.size) || desktop.size <= 0 || desktop.size > 128 * 1024 * 1024) throw new Error("无效的正式宿主元数据");
    if (!desktopBytes.equals(await publicGet(`${config.base}/${updateKey}`, 1024 * 1024))) throw new Error("正式宿主元数据公开校验失败");
    const installer = await publicGet(desktop.url, desktop.size);
    if (!installer || installer.length !== desktop.size || sha256(installer) !== desktop.sha256) throw new Error("正式宿主安装包公开校验失败");
    const catalog = JSON.parse(successor);
    checkCatalog(catalog);
    if (!successor.equals(await publicGet(`${config.base}/${catalogKey}`, 1024 * 1024))) throw new Error("新版市场公开校验失败");
    for (const entry of catalog.entries) {
      const content = await publicGet(`${config.base}/${packagesKey}/${entry.artifact}`, entry.size);
      if (!content || content.length !== entry.size || sha256(content) !== entry.sha256) throw new Error("新版插件公开校验失败");
    }
    if (!marker) {
      const created = { api: 1, successor: catalogKey, startedAt: now.toISOString(), retireAfter: new Date(now.getTime() + 30 * 86400000).toISOString() };
      log(`${apply ? "启动" : "可启动"}旧市场 30 天退役期，保留至 ${created.retireAfter}`);
      if (apply) await store.put(config.key(retirementKey), Buffer.from(JSON.stringify(created)),
        { headers: { "x-oss-forbid-overwrite": "true", "Cache-Control": "no-store" }, mime: "application/json" });
      return { retired: false, obsolete: [] };
    }
    const obsolete = [];
    for (const prefix of [config.key(`${legacyPackagesKey}/`), config.key(`${legacyRegistryKey}/`), config.key("catalog-history/")]) {
      let token;
      do {
        const page = await store.listV2({ prefix, "max-keys": 1000, ...(token ? { "continuation-token": token } : {}) });
        for (const object of page.objects || []) {
          if (!object.name.startsWith(prefix)) throw new Error("OSS 列举结果超出退役范围");
          // New-generation history must never be treated as legacy data.
          if (prefix.endsWith("catalog-history/") && object.name.slice(prefix.length).includes("/")) continue;
          obsolete.push(object.name);
        }
        const next = page.isTruncated ? page.nextContinuationToken : undefined;
        if (page.isTruncated && (!next || next === token)) throw new Error("OSS 列举分页异常");
        token = next;
      } while (token);
    }
    log(`${apply ? "退役" : "只读退役预演"}：清理 ${obsolete.length} 个旧对象`);
    for (const key of obsolete) log(`清理：${key}`);
    if (!apply) return { retired: false, obsolete };
    // Exactly the old schema. Do not add a message field the shipped parser would reject.
    const tombstone = Buffer.from('{"api":1,"entries":[]}\n');
    await store.put(config.key(legacyCatalogKey), tombstone, { headers: { "Cache-Control": "no-cache" }, mime: "application/json" });
    if (!tombstone.equals(await publicGet(`${config.base}/${legacyCatalogKey}`, 1024 * 1024))) throw new Error("旧目录退役公开校验失败，保留旧包");
    for (const key of obsolete) await store.delete(key);
    return { retired: true, obsolete };
  } finally {
    if (locked) {
      const current = await get(store, lock);
      if (current && JSON.parse(current).owner === owner) await store.delete(lock);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !["--plan", "--apply"].includes(arg))) throw new Error("使用 --plan 或 --apply");
  const config = ossConfig();
  const { default: OSS } = await import("ali-oss");
  const store = new OSS({ region: config.region, bucket: config.bucket, accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET, stsToken: process.env.OSS_STS_TOKEN || undefined, secure: true, timeout: 120000 });
  await retireLegacy({ store, config, apply: args.includes("--apply") });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.code ? `OSS 操作失败：${error.code}` : error.message); process.exitCode = 1; });
}
