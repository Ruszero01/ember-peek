import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { ossConfig } from "./oss-config.mjs";

export const updateKey = "channels/stable/desktop/windows-x86_64/latest.json";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function get(store, key) {
  try { return Buffer.from((await store.get(key)).content); }
  catch (error) { if (error.code === "NoSuchKey") return null; throw error; }
}

export async function publishDesktop({store, config, release, files, apply = false}) {
  if (release.draft !== false || release.prerelease !== false) throw new Error("Only a published stable release can be mirrored");
  const version = release.tag_name?.replace(/^v/, "");
  if (!semver.valid(version) || semver.prerelease(version) || release.tag_name !== `v${version}`) throw new Error("Invalid stable release tag");
  const installers = [...files.keys()].filter(name => /^[a-zA-Z0-9][a-zA-Z0-9._+ -]*-setup\.exe$/.test(name));
  if (installers.length !== 1 || !files.has("SHA256SUMS.txt")) throw new Error("Expected exactly one Windows installer and checksums");
  const name = installers[0], bytes = files.get(name), sha256 = hash(bytes);
  const checksums = files.get("SHA256SUMS.txt").toString("utf8").replace(/^\uFEFF/, "");
  // GitHub replaces spaces in uploaded asset names with dots; checksums retain
  // the original Tauri filename. Only that filename normalization is accepted.
  const checksumMatches = checksums.split(/\r?\n/).some(line => {
    const entry = /^([a-f0-9]{64})  (.+)$/i.exec(line.trim());
    return entry && entry[1].toLowerCase() === sha256 &&
      (entry[2] === name || entry[2].replaceAll(" ", ".") === name);
  });
  if (!bytes.length || !checksumMatches) throw new Error("Installer checksum mismatch");
  if (!release.assets?.some(asset => asset.name === name && asset.size === bytes.length)) throw new Error("Installer does not match release asset");
  const previous = await get(store, config.key(updateKey));
  if (previous && semver.gt(JSON.parse(previous).version, version)) throw new Error("Refusing to replace a newer stable release");
  const relative = `desktop/windows-x86_64/${version}/${name}`;
  const key = config.key(relative);
  const existing = await get(store, key);
  if (existing && hash(existing) !== sha256) throw new Error("Published installer bytes cannot be changed");
  const manifest = {api:1, version, url:`${config.base}/desktop/windows-x86_64/${version}/${encodeURIComponent(name)}`, sha256, size:bytes.length};
  if (!apply) return manifest;
  if (!existing) await store.put(key, bytes, {mime:"application/octet-stream",headers:{"Cache-Control":"public, max-age=31536000, immutable","x-oss-forbid-overwrite":"true"}});
  await store.put(config.key(updateKey), Buffer.from(`${JSON.stringify(manifest,null,2)}\n`), {mime:"application/json",headers:{"Cache-Control":"no-cache"}});
  return manifest;
}

async function main() {
  const directory = path.resolve(process.argv[2] || "installer");
  const release = JSON.parse(await readFile(path.join(directory,"release.json"),"utf8"));
  const files = new Map();
  for (const name of await readdir(directory)) if (name.endsWith("-setup.exe") || name === "SHA256SUMS.txt") files.set(name,await readFile(path.join(directory,name)));
  const config = ossConfig();
  for (const key of ["OSS_ACCESS_KEY_ID","OSS_ACCESS_KEY_SECRET"]) if (!process.env[key]) throw new Error(`Missing ${key}`);
  const {default:OSS} = await import("ali-oss");
  const store = new OSS({region:config.region,bucket:config.bucket,accessKeyId:process.env.OSS_ACCESS_KEY_ID,accessKeySecret:process.env.OSS_ACCESS_KEY_SECRET,stsToken:process.env.OSS_STS_TOKEN || undefined,secure:true,timeout:120_000});
  console.log(JSON.stringify(await publishDesktop({store,config,release,files,apply:process.argv.includes("--apply")})));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.code ? `OSS operation failed: ${error.code}` : error.message);
  process.exitCode = 1;
});
