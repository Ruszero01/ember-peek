import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));

function markdownFiles(directory) {
 const files=[];
 for(const entry of readdirSync(directory,{withFileTypes:true})) {
  if(entry.name.startsWith('.')||['node_modules','target','dist'].includes(entry.name))continue;
  const location=join(directory,entry.name);
  if(entry.isDirectory())files.push(...markdownFiles(location));
  else if(extname(entry.name).toLowerCase()==='.md')files.push(location);
 }
 return files;
}

test('repository Markdown keeps local links valid',()=>{
 const failures=[];
 for(const file of markdownFiles(root)) {
  const source=readFileSync(file,'utf8');
  for(const match of source.matchAll(/!?(?:\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
   const target=match[1];
   if(/^(?:https?:|mailto:|#)/i.test(target))continue;
   const path=decodeURIComponent(target.split('#')[0]);
   if(path&&!existsSync(resolve(dirname(file),path)))failures.push(`${file}: ${target}`);
  }
 }
 assert.deepEqual(failures,[]);
});

test('the repository landing page is English-first with a reciprocal Chinese edition',()=>{
 const english=readFileSync(join(root,'README.md'),'utf8');
 const chinese=readFileSync(join(root,'README.zh-CN.md'),'utf8');
 assert.match(english,/\[简体中文\]\(README\.zh-CN\.md\)/);
 assert.match(chinese,/\[English\]\(README\.md\)/);
 assert.match(english,/^## Overview$/m);
 assert.doesNotMatch(english,/^## 功能概览$/m);
});

test('the changelog has one Unreleased section before the current release',()=>{
 const changelog=readFileSync(join(root,'CHANGELOG.md'),'utf8');
 assert.equal((changelog.match(/^## \[Unreleased\]$/gm)||[]).length,1);
 assert.ok(changelog.indexOf('## [Unreleased]')<changelog.indexOf('## [0.1.0]'));
});
