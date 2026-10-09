// Module workers cannot load blob URLs from the preview's opaque sandbox origin.
import { transform } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const input = fileURLToPath(new URL("./ui/vendor/pdf.worker.mjs", import.meta.url));
const output = fileURLToPath(new URL("./ui/vendor/pdf.worker.bundle.mjs", import.meta.url));
const result = await transform(await readFile(input, "utf8"), {
  format: "iife", target: "es2022", minify: true,
});
await writeFile(output, result.code);
