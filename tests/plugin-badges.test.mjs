import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('../',import.meta.url);
test('built catalog preserves beta markers declared by plugin manifests',()=>{
 const catalog=JSON.parse(readFileSync(new URL('.marketplace/catalog.json',root),'utf8'));
 for(const directory of readdirSync(new URL('plugins/',root))){
  const manifest=JSON.parse(readFileSync(new URL(`plugins/${directory}/plugin.json`,root),'utf8'));
  const entry=catalog.entries.find(entry=>entry.id===manifest.id);
  assert.ok(entry,manifest.id);
  assert.equal(entry.beta===true,manifest.beta===true,manifest.id);
 }
});

test('only the official workshop plugin retains a beta marker',()=>{
 const marked=readdirSync(new URL('plugins/',root))
  .map(directory=>JSON.parse(readFileSync(new URL(`plugins/${directory}/plugin.json`,root),'utf8')))
  .filter(manifest=>manifest.beta===true)
  .map(manifest=>manifest.id);
 assert.deepEqual(marked,['ember.workshop']);
});
