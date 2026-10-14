import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as protocol from '../src/protocol.mjs';

test('native wheel listener accumulates trackpad motion, prevents scrolling and supports explicit reset', () => {
  const require = createRequire(import.meta.url), module = {exports:{}}, effects = [], listeners = new Map(), changes = [];
  const code = transformSync(readFileSync(new URL('../src/ScrubControl.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code;
  runInNewContext(code,{module,exports:module.exports,setTimeout,clearTimeout,require:name=>name==='react'?{useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:effect=>effects.push(effect)}:name==='./i18n'?{useT:()=>key=>key}:name==='./protocol.mjs'?protocol:require(name)});
  const control = {id:'speed',kind:'scrub',label:'Speed',min:0.25,max:4,value:1,step:0.25,defaultValue:1};
  const view = module.exports.ScrubControl({control,active:true,onActiveChange:()=>{},onChange:value=>changes.push(value)});
  view.props.ref.current = {addEventListener:(name,fn,options)=>{if(name==='wheel')assert.equal(options.passive,false);listeners.set(name,fn);},removeEventListener:name=>listeners.delete(name)};
  const cleanups = effects.map(effect=>effect());
  let prevented = 0;
  const wheel = (deltaY,more={})=>listeners.get('wheel')({deltaY,deltaMode:0,preventDefault:()=>prevented++,...more});
  wheel(-50); assert.equal(changes.length,0);
  wheel(-50); assert.equal(changes.at(-1),1.25);
  wheel(-100); assert.equal(changes.at(-1),1.5);
  wheel(100); assert.equal(changes.at(-1),1.25);
  wheel(-100,{ctrlKey:true}); assert.equal(changes.length,3); assert.equal(prevented,4);
  wheel(3,{deltaMode:1}); assert.equal(changes.at(-1),1);
  view.props.onDoubleClick(); assert.equal(changes.at(-1),1);
  let resetPrevented = false;
  view.props.onKeyDown({key:'Backspace',preventDefault:()=>{resetPrevented=true;}});
  assert.equal(resetPrevented,true); assert.equal(changes.at(-1),1);
  cleanups.forEach(cleanup=>cleanup?.()); assert.equal(listeners.size,0);
});

test('late plugin values cannot rewind a continuous wheel gesture across React renders', () => {
  const require = createRequire(import.meta.url), module = {exports:{}}, slots = [], listeners = new Map(), changes = [];
  let cursor = 0, effects = [];
  const hooks = {
    useState:initial => {
      const index = cursor++; const slot = slots[index] ??= {value:initial};
      return [slot.value, value => {slot.value = value;}];
    },
    useRef:initial => slots[cursor++] ??= {current:initial},
    useEffect:(effect,deps) => {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value,position)=>value!==previous.deps[position])) effects.push(()=>{previous?.cleanup?.();slots[index]={deps,cleanup:effect()};});
    },
  };
  const code = transformSync(readFileSync(new URL('../src/ScrubControl.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code;
  runInNewContext(code,{module,exports:module.exports,setTimeout,clearTimeout,require:name=>name==='react'?hooks:name==='./i18n'?{useT:()=>key=>key}:name==='./protocol.mjs'?protocol:require(name)});
  const element = {addEventListener:(name,listener)=>listeners.set(name,listener),removeEventListener:name=>listeners.delete(name)};
  const onChange=value=>changes.push(value), onActiveChange=()=>{};
  const render = value => {
    cursor=0;effects=[];
    const view=module.exports.ScrubControl({control:{id:'speed',kind:'scrub',label:'Speed',min:0.25,max:4,step:0.25,value},active:true,onChange,onActiveChange});
    view.props.ref.current=element;effects.forEach(effect=>effect());return view;
  };
  try {
    render(1);
    const wheel=()=>listeners.get('wheel')({deltaY:-100,deltaMode:0,preventDefault(){}});
    wheel();assert.equal(render(1).props['aria-valuenow'],1.25);
    wheel();assert.equal(render(1.25).props['aria-valuenow'],1.5);
    wheel();assert.equal(render(1.25).props['aria-valuenow'],1.75);
    assert.deepEqual(changes,[1.25,1.5,1.75]);
    render(1.75);assert.equal(render(1.75).props['aria-valuenow'],1.75);
  } finally { slots.forEach(slot=>slot.cleanup?.()); }
});
