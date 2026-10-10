import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const module={exports:{}};
runInNewContext(transformSync(readFileSync(new URL('../src/plugin-settings-search.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,require});
const {searchPluginSettings}=module.exports;
const plugins=[{id:'ember.image',name:'图片预览',settings:[]},{id:'ember.video',name:'视频预览',settings:[{label:'播放速度',help:'打开视频时的默认播放倍率',options:null},{label:'显示方式',options:[{value:'fit',label:'适应窗口'}]},{label:'内部缓存',help:'secret',hidden:true}],values:{token:'private-value'}},{id:'third.word',name:'Word Preview',settings:[]}];
test('sidebar search keeps original order and indices while matching names and IDs',()=>{
 assert.deepEqual(Array.from(searchPluginSettings(plugins,'  '),r=>r.index),[0,1,2]);
 assert.equal(searchPluginSettings(plugins,'视频')[0].index,1);
 assert.equal(searchPluginSettings(plugins,'WORD preview')[0].plugin.id,'third.word');
 assert.equal(searchPluginSettings(plugins,'Ember.Video')[0].index,1);
 assert.deepEqual(plugins.map(p=>p.id),['ember.image','ember.video','third.word']);
});
test('visible setting labels, help and option names support multiple search terms',()=>{
 for(const query of ['播放速度','视频 倍率','适应窗口'])assert.equal(searchPluginSettings(plugins,query)[0].plugin.id,'ember.video');
 assert.equal(searchPluginSettings(plugins,'视频 不存在').length,0);
});
test('hidden settings and persisted values never appear in search results',()=>{
 for(const query of ['内部缓存','secret','private-value'])assert.equal(searchPluginSettings(plugins,query).length,0);
 assert.equal(searchPluginSettings(plugins,'missing').length,0);
 assert.equal(searchPluginSettings(plugins,'').length,3);
});

test('Chinese names and visible settings match full pinyin and initials',()=>{
 for(const query of ['shipin','SHIPINYULAN','sp','spyl','shi pin','bf sd','bofangsudu','syck','shipin 预览'])assert.equal(searchPluginSettings(plugins,query)[0].plugin.id,'ember.video');
 for(const query of ['tupian','tpyl'])assert.equal(searchPluginSettings(plugins,query)[0].plugin.id,'ember.image');
 for(const query of ['neibuhuancun','nbhc','secret'])assert.equal(searchPluginSettings(plugins,query).length,0);
});
test('mixed Latin names and polyphonic phrases retain useful pinyin aliases',()=>{
 const mixed=[{id:'test.pdf',name:'PDF 预览',settings:[]},{id:'test.city',name:'重庆预览',settings:[]}];
 assert.equal(searchPluginSettings(mixed,'PDFyl')[0].plugin.id,'test.pdf');
 assert.equal(searchPluginSettings(mixed,'pdfyulan')[0].plugin.id,'test.pdf');
 assert.equal(searchPluginSettings(mixed,'chongqing')[0].plugin.id,'test.city');
 assert.equal(searchPluginSettings(mixed,'cqyl')[0].plugin.id,'test.city');
});
test('cached metadata updates do not retain stale labels or hidden settings',()=>{
 const original=[{id:'test.custom',name:'自定义',settings:[{label:'播放速度'}]}];
 assert.equal(searchPluginSettings(original,'bfsd').length,1);
 const changed=[{...original[0],settings:[{label:'播放速度',hidden:true}]}];
 assert.equal(searchPluginSettings(changed,'bfsd').length,0);
 const renamed=[{...original[0],name:'新名称',settings:[]}];
 assert.equal(searchPluginSettings(renamed,'zidingyi').length,0);
 assert.equal(searchPluginSettings(renamed,'xmc').length,1);
});
