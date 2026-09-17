import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Checkouts may use LF or CRLF. A source fingerprint must not depend on the machine's
// Git line-ending settings; binary assets still contribute their exact bytes.
export function hashInput(hash, name, data) {
  const text = /\.(rs|toml|lock|json|js|mjs|css|html|md|txt|c|cpp|h|hpp|svg)$/i.test(name);
  const bytes = text ? Buffer.from(data.toString("utf8").replace(/\r\n/g, "\n")) : data;
  hash.update(JSON.stringify([name, bytes.length])).update(bytes);
}

export async function hashInputTree(hash, directory, label) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const name = `${label}/${entry.name}`;
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) await hashInputTree(hash, location, name);
    else if (entry.isFile()) hashInput(hash, name, await readFile(location));
    else throw new Error(`发布源码不允许符号链接或特殊文件：${location}`);
  }
}
