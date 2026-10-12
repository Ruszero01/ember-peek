import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractReleaseNotes } from '../scripts/release-notes.mjs';

test('repository release notes exclude development details retained under Unreleased', () => {
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const detail = '使用无损压缩分块传输';
  assert.ok(extractReleaseNotes(changelog, "Unreleased").includes(detail));
  for (const [, version] of changelog.matchAll(/^## \[([^\]]+)\]/gm)) {
    if (version !== "Unreleased") assert.ok(!extractReleaseNotes(changelog, version).includes(detail));
  }
});

test('extracts only the exact version, preserving subsections and fenced examples', () => {
  const changelog = '# Log\r\n## [Unreleased]\r\nfuture\r\n## [0.1.0] - 2026-09-17\r\n### Features\r\nhello\r\n```md\r\n## example\r\n```\r\n## [0.0.1]\r\nold';
  assert.equal(extractReleaseNotes(changelog, '0.1.0'), '### Features\nhello\n```md\n## example\n```\n');
});

test('rejects missing, duplicate and empty release sections', () => {
  for (const source of ['## [0.1.00]\nwrong', '## [0.1.0]\none\n## [0.1.0]\ntwo', '## [0.1.0]\n\n## [0.0.1]\nold']) {
    assert.throws(() => extractReleaseNotes(source, '0.1.0'));
  }
});
