import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('image, PSD and video preserve window size by default without changing display defaults',()=>{
 for(const name of ['image','psd','video']){
  const manifest=JSON.parse(readFileSync(new URL('../plugins/'+name+'/plugin.json',import.meta.url),'utf8'));
  assert.equal(manifest.settings.find(s=>s.key==='frameWindow').default,false,name);
  if(name!=='video')assert.equal(manifest.settings.find(s=>s.key==='fitWindow').default,true,name);
 }
});
