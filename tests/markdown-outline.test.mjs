import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function harness() {
  const calls=[],positions=[];let receive,settings;
  const sdk={sidebar:async value=>{calls.push({open:value});},postTo:async(role,message)=>{calls.push({role,message});return true;},
    onMessage:fn=>{receive=fn;return()=>{};},onSettings:fn=>{settings=fn;return()=>{};},configuration:()=>({showOutline:true})};
  const context=vm.createContext({sdk,addEventListener(){}});
  const source=(await readFile(new URL('../plugins/markdown/ui/outline.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'const {sidebar,postTo,onMessage,onSettings,configuration,onLocale}=sdk;\n').replaceAll('export ','');
  vm.runInContext(source+'\nglobalThis.batches=outlineBatches;globalThis.create=outlineSidebar;',context);
  return {context,calls,positions,receive:message=>receive(message,'sidebar'),settings:value=>settings(value)};
}
test('outline transfer is bounded and preserves heading order and plain text',async()=>{
  const h=await harness();
  const headings=Array.from({length:150},(_,i)=>({title:i===0?'<script>unsafe</script>':String(i).repeat(300),level:i%6+1,line:i+1}));
  const batches=h.context.batches(headings);
  assert.deepEqual(Array.from(batches,b=>b.start),[0,64,128]);
  assert.ok(batches.every(b=>b.entries.length<=64&&b.entries.every(e=>e.title.length<=512)));
  assert.equal(batches[0].entries[0].title,'<script>unsafe</script>');
  h.context.create(headings,{navigate:line=>h.positions.push(line),refresh(){},say:key=>key});
  await h.receive({kind:'outline-hello'});
  assert.equal(h.calls.filter(c=>c.message?.kind==='outline-entries').length,3);
  for(const index of [-1,150,Infinity,'1'])await h.receive({kind:'outline-navigate',index});
  assert.equal(h.positions.length,0);
  await h.receive({kind:'outline-navigate',index:64});assert.deepEqual(h.positions,[65]);
});
test('outline default preference reacts to settings while manual toggles stay temporary',async()=>{
  const h=await harness(),outline=h.context.create([],{navigate(){},refresh(){},say:key=>key});
  assert.equal(outline.control().active,true);
  await outline.control().run();assert.equal(outline.control().active,false);
  h.settings({showOutline:true});assert.equal(outline.control().active,false);
  h.settings({showOutline:false});h.settings({showOutline:true});
  assert.equal(outline.control().active,true);
});
