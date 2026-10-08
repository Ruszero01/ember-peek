import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("quality gates prepare Tauri assets before invoking Rust checks", () => {
  for (const gate of ["check", "ci"]) {
    const dir = mkdtempSync(path.join(tmpdir(), "ember-cold-gate-"));
    try {
      const runner = path.join(dir, "task.cjs");
      writeFileSync(runner, `
        const fs = require('node:fs');
        const task = process.argv[2];
        if (task === 'build') fs.writeFileSync('frontend-built', 'ready');
        if (task === 'lint' && !fs.existsSync('frontend-built')) process.exit(1);
        fs.appendFileSync('tasks', task + '\\n');
      `);
      const command = scripts[gate].replace(/npm run ([\w:-]+)|npm test/g,
        (_, task) => `"${process.execPath}" "${runner}" ${task || "test"}`);
      const result = spawnSync(command, { cwd: dir, shell: true, encoding: "utf8" });
      assert.equal(result.status, 0, `${gate}: ${result.stderr}`);
      const tasks = readFileSync(path.join(dir, "tasks"), "utf8").trim().split("\n");
      assert.ok(tasks.includes("build") && tasks.includes("lint"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
