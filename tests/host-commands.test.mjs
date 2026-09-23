// 宿主命令的接线契约。前端是 TypeScript、原生层是 Rust，中间只有命令名这一个字符串：注册表里少
// 一个名字不会有编译错误，只会在用户点下去的那一刻变成 "command not found"。这里把网页里每一次
// `call("...")` 与 main.rs 的注册表对齐，让漏注册和拼错名字在门禁里就失败。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = join(root, "src");

/** Every command name the host UI asks the native layer for. Both call shapes count:
 *  `call("x")` and `call<Return>("x")`, the latter written across several lines when the
 *  return type is a shape. A name built at runtime cannot be read here and is not claimed. */
async function invoked() {
  const names = new Set();
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const text = await readFile(join(src, entry.name), "utf8");
    for (const match of text.matchAll(/\bcall\s*(?:<[\s\S]*?>)?\s*\(\s*"([a-z_]+)"/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

/** Every command the application registers, without the module prefix a handler entry may
 *  carry: `desktop::show_settings` answers to `show_settings` on the wire. */
async function registered() {
  const main = await readFile(join(root, "src-tauri", "src", "main.rs"), "utf8");
  const handler = main.match(/generate_handler!\[([\s\S]*?)\]/);
  assert.ok(handler, "main.rs registers no commands");
  return new Set(
    handler[1]
      .split(",")
      .map((entry) => entry.trim().split("::").pop())
      .filter(Boolean),
  );
}

test("every native command the host UI invokes is registered", async () => {
  const called = await invoked();
  const known = await registered();
  // A regex that quietly stops matching would make this test pass by proving nothing.
  assert.ok(called.size > 20, `only ${called.size} commands were read from src/`);
  const missing = [...called].filter((name) => !known.has(name)).sort();
  assert.deepEqual(
    missing,
    [],
    `the host UI calls commands the native layer never registered: ${missing.join(", ")}`,
  );
});
