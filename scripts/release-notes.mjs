import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function extractReleaseNotes(source, version) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const matches = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (!fence && /^##\s+/.test(lines[i])) matches.push({ index: i, title: lines[i] });
  }
  const selected = matches.filter(({ title }) => /^##\s+\[([^\]]+)\](?:\s.*)?$/.exec(title)?.[1] === version);
  if (selected.length !== 1) throw new Error(`CHANGELOG.md 必须且只能包含一个 [${version}] 章节`);
  const start = selected[0].index;
  const end = matches.find(({ index }) => index > start)?.index ?? lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  if (!body) throw new Error(`CHANGELOG.md 的 [${version}] 章节不能为空`);
  return `${body}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const notes = extractReleaseNotes(await readFile(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
    const output = process.argv[2];
    if (output) await writeFile(path.resolve(output), notes);
    else process.stdout.write(notes);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
