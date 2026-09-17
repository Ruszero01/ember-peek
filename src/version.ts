/**
 * 版本号的唯一来源是 package.json，由 vite.config.ts 在构建时注入。
 * 改版本请运行 npm run version:set -- <版本>，它会同步 Cargo.toml、
 * src-tauri/tauri.conf.json、plugins/*\/plugin.json 与 Cargo.lock。
 */
export const APP_VERSION: string = __APP_VERSION__;

/** 主版本号，如 "v0.1"，用于紧凑位置。 */
export const APP_VERSION_SHORT = `v${APP_VERSION.split(".").slice(0, 2).join(".")}`;
