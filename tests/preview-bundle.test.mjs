import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('the preview entry does not eagerly load the settings pinyin dictionary', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { metafile } = await build({
    absWorkingDir: root,
    entryPoints: [fileURLToPath(new URL('../src/main.tsx', import.meta.url))],
    outdir: resolve(tmpdir(), 'ember-preview-bundle-test'),
    bundle: true, splitting: true, format: 'esm', platform: 'browser',
    external: ['lucide-react/dynamicIconImports'], loader: { '.css': 'empty', '.svg': 'text' }, write: false, metafile: true, logLevel: 'silent',
  });
  const outputs = new Map(Object.entries(metafile.outputs).map(([path, output]) => [resolve(root, path), output]));
  const entry = [...outputs].find(([, output]) => output.entryPoint === 'src/main.tsx');
  assert.ok(entry);
  const pending = [entry[0]], visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    const output = outputs.get(path);
    assert.ok(output, path);
    assert.equal(Object.keys(output.inputs).some(input => input.includes('pinyin-pro')), false, path);
    for (const dependency of output.imports) {
      if (!dependency.external && dependency.kind !== 'dynamic-import') {
        const target = resolve(root, dependency.path);
        pending.push(outputs.has(target) ? target : resolve(dirname(path), dependency.path));
      }
    }
  }
  assert.ok([...outputs.values()].some(output => Object.keys(output.inputs).some(input => input.includes('pinyin-pro'))));
});
