import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {transformSync} from 'esbuild';
import {runInNewContext} from 'node:vm';
const module={exports:{}};
runInNewContext(transformSync(readFileSync(new URL('../src/plugin-categories.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports});
const {pluginCategory,groupPlugins,matchesCategory}=module.exports;
test('category is package metadata and never inferred from format or identity',()=>{
 assert.equal(pluginCategory({category:'office',id:'third.party',extensions:['psd']}),'office');
 for(const category of [undefined,null,'','future-category','<script>'])assert.equal(pluginCategory({category}),'other');
 assert.equal(pluginCategory({id:'ember.word',extensions:['docx']}),'other');
});
test('groups keep every plugin once and preserve ordering inside each scope',()=>{
 const plugins=[{id:'a',category:'office'},{id:'b',category:'media'},{id:'c',category:'office'},{id:'d'},{id:'e',category:'future'}];
 const groups=groupPlugins(plugins);
 assert.deepEqual(Array.from(groups,g=>g.category),['media','office','other']);
 assert.deepEqual(Array.from(groups[1].entries,p=>p.id),['a','c']);
 assert.equal(new Set(groups.flatMap(g=>g.entries).map(p=>p.id)).size,plugins.length);
 assert.deepEqual(plugins.map(p=>p.id),['a','b','c','d','e']);
});
test('scope filtering composes with a text search and includes fallback plugins',()=>{
 const plugins=[{category:'office',name:'Word'},{category:'media',name:'Image'},{name:'Custom'}];
 assert.equal(plugins.filter(p=>matchesCategory(p,'all')).length,3);
 assert.equal(plugins.filter(p=>matchesCategory(p,'office')&&p.name.includes('Word')).length,1);
 assert.equal(plugins.filter(p=>matchesCategory(p,'design')).length,0);
 assert.equal(plugins.filter(p=>matchesCategory(p,'other'))[0].name,'Custom');
});
test('official manifests declare scopes for market and installed lists',()=>{
 for(const [plugin,category] of [['image','media'],['video','media'],['word','office'],['excel','office'],['powerpoint','office'],['pdf','office'],['pdf-editor','office'],['psd','design'],['text','text'],['code','text'],['markdown','text'],['text-editor','text'],['metadata','tools'],['workshop','tools']]){
  const manifest=JSON.parse(readFileSync(new URL('../plugins/'+plugin+'/plugin.json',import.meta.url),'utf8'));assert.equal(manifest.category,category);
 }
});

test('category picker exposes counts, the active scope and accessible native buttons',()=>{
 const require=createRequire(import.meta.url),viewModule={exports:{}};
 runInNewContext(transformSync(readFileSync(new URL('../src/PluginCategories.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,{module:viewModule,exports:viewModule.exports,require:name=>name==='./i18n'?{useT:()=>key=>key}:name==='./plugin-categories'?module.exports:require(name)});
 const html=renderToStaticMarkup(createElement(viewModule.exports.PluginCategories,{entries:[{category:'office'},{category:'media'},{}],value:'office',onChange:()=>assert.fail()}));
 assert.match(html,/role="group"/);assert.equal((html.match(/type="button"/g)||[]).length,7);
 assert.match(html,/aria-pressed="true">plugins.category.office<span>1<\/span>/);
 assert.match(html,/plugins.category.all<span>3<\/span>/);assert.match(html,/plugins.category.other<span>1<\/span>/);
});
