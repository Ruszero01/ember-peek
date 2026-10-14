import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
const module = { exports: {} };
runInNewContext(transformSync(readFileSync(new URL('../src/settings-navigation.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module, exports: module.exports });
const { previewSettingsPage, settingsDestination } = module.exports;
const plugins = [{ id: 'example.pdf' }, { id: 'example.editor' }];
test('preview settings follow the viewport plugin rather than extension or shared source', () => {
  assert.equal(previewSettingsPage({ pluginId: 'example.pdf' }, plugins), 'plugin:example.pdf');
  assert.equal(previewSettingsPage({ pluginId: 'example.editor' }, plugins), 'plugin:example.editor');
  const destination = settingsDestination('plugin:example.pdf', plugins);
  assert.equal(destination.page, 'plugin');
  assert.equal(destination.pluginId, 'example.pdf');
  assert.equal(settingsDestination('plugin:example.editor', plugins).pluginId, 'example.editor');
});
test('empty previews and removed plugins fall back to general settings', () => {
  assert.equal(previewSettingsPage(undefined, plugins), 'general');
  assert.equal(previewSettingsPage({ pluginId: 'removed' }, plugins), 'general');
  for (const route of ['plugin:removed', 'plugin:', 'general']) {
    assert.equal(settingsDestination(route, plugins).page, 'general');
    assert.equal(settingsDestination(route, plugins).pluginId, null);
  }
});
test('existing tool and management destinations remain supported', () => {
  for (const route of ['plugins', 'tool:example.editor']) assert.equal(settingsDestination(route, plugins).page, 'plugins');
  for (const route of ['about', 'welcome']) assert.equal(settingsDestination(route, plugins).page, route);
});
