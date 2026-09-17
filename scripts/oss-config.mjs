import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const target = "windows-x86_64";
export const catalogKey = `channels/stable/api-1/${target}/catalog.json`;
export const packagesKey = `packages/${target}`;

export function publicBase(value) {
  const url = new URL(value || "missing:");
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash || /[\s%]/.test(value)) {
    throw new Error("OSS_PUBLIC_BASE_URL 必须是不含凭据、查询参数或转义字符的 HTTPS 地址");
  }
  return url.href.replace(/\/$/, "");
}

export function sourceConfig(base) {
  base = publicBase(base);
  return { api: 1, sources: [{ name: "官方源", catalog: `${base}/${catalogKey}`, base: `${base}/${packagesKey}/` }] };
}

export function ossConfig(env = process.env) {
  const region = env.OSS_REGION;
  const bucket = env.OSS_BUCKET;
  const prefix = env.OSS_PREFIX || "ember-peek";
  if (!/^oss-[a-z0-9-]+$/.test(region || "")) throw new Error("请设置 OSS_REGION，例如 oss-cn-hongkong");
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || "")) throw new Error("请设置有效的 OSS_BUCKET");
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)) throw new Error("OSS_PREFIX 必须为普通相对对象前缀");
  const base = publicBase(env.OSS_PUBLIC_BASE_URL);
  if (new URL(base).pathname !== `/${prefix}`) throw new Error("OSS_PUBLIC_BASE_URL 的路径必须与 OSS_PREFIX 一致（不使用 CDN 路径重写）");
  return { region, bucket, prefix, base, key: (name) => `${prefix}/${name}` };
}

export const releaseDirectory = path.join(root, ".release");
