import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {transformSync} from 'esbuild';
const source=readFileSync(fileURLToPath(new URL('../src/viewLifecycle.ts',import.meta.url)),'utf8');
const {code}=transformSync(source,{loader:'ts',format:'esm'});
const {createViewVisibilityReporter}=await import('data:text/javascript,'+encodeURIComponent(code));

test('rapid hide and remount remain ordered while other sessions proceed independently',async()=>{
 const calls=[];let release;
 const held=new Promise(resolve=>release=resolve);
 const report=createViewVisibilityReporter(async(id,visible)=>{calls.push([id,visible]);if(calls.length===1)await held;});
 const show=report('a',true),hide=report('a',false),remount=report('a',true);
 await report('b',true);
 assert.deepEqual(calls,[['a',true],['b',true]]);
 release();await Promise.all([show,hide,remount]);
 assert.deepEqual(calls,[['a',true],['b',true],['a',false],['a',true]]);
});
test('an expired session reply does not block subsequent visibility updates',async()=>{
 const calls=[];
 const report=createViewVisibilityReporter(async(id,visible)=>{calls.push(visible);if(calls.length===1)throw Error('expired');});
 const closed=report('a',false),reopened=report('a',true);
 await assert.rejects(closed,/expired/);await reopened;
 assert.deepEqual(calls,[false,true]);
});
