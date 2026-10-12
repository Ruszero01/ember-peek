import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function sidebarHarness() {
  const elements = [], frames = new Map(), listeners = new Map();
  let message, observer, nextFrame = 0;
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = {}; this.events = {}; this.clientWidth = 220; this.clientHeight = 500; this.scrollTop = 0; this.classList = {add() {}}; elements.push(this); }
    append(...children) { for (const child of children) { child.remove(); child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this.append(...children); }
    remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this),1); this.parent = undefined; } }
    setAttribute(key,value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key]; }
    addEventListener(key,fn) { this.events[key] = fn; }
    removeEventListener(key) { delete this.events[key]; }
  }
  const body = new Element('body'), head = new Element('head');
  const sdk = {ready:Promise.resolve(),translate:()=>key=>key,onLocale:()=>()=>{},onMessage:fn=>{message=fn;return()=>{};},postTo:async()=>true};
  const context = vm.createContext({sdk,document:{body,head,createElement:tag=>new Element(tag)},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),
    ResizeObserver:class {constructor(fn){this.callback=fn;observer=this;}observe(){this.callback();}disconnect(){this.disconnected=true;}}});
  const source = (await readFile(new URL('../sdk/web/page-sidebar.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/, 'const { ready, onMessage, postTo, sidebar, translate, onLocale, configuration, onSettings } = sdk;\n').replaceAll('export ','');
  vm.runInContext(source+'\nglobalThis.mount = mountPageSidebar;',context);
  await context.mount();
  const list = elements.find(element=>element.className==='page-sidebar-list');
  const spacer = elements.find(element=>element.className==='page-sidebar-spacer');
  const flush = () => { const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn()); };
  return {list,spacer,frames,flush,send:value=>message(value,'view'),resize:()=>observer.callback(),close:()=>listeners.get('pagehide')(),observer};
}

test('duplicate page state and resize bursts retain thumbnail DOM and decoded images', async () => {
  const h = await sidebarHarness();
  const state={kind:'pages',count:20,page:1,ratio:1};
  h.send(state);h.flush();
  const row = h.spacer.children[0], preview = row.children[0];
  const data='data:image/png;base64,AA==';
  h.send({kind:'image',page:1,offset:0,total:data.length,data});h.flush();
  const image = preview.children[0];assert.ok(image);
  for(let i=0;i<100;i++)h.send(state);
  assert.equal(h.frames.size,0);
  for(let i=0;i<100;i++)h.resize();
  assert.equal(h.frames.size,1);h.flush();
  assert.equal(h.spacer.children[0],row);assert.equal(preview.children[0],image);
  h.list.clientWidth=216;h.resize();h.flush();
  assert.equal(h.spacer.children[0],row);assert.equal(preview.children[0],image);
  h.send({...state,page:2});h.flush();
  assert.equal(h.spacer.children[0],row);assert.equal(row.getAttribute('aria-current'),'false');
  h.resize();h.close();assert.equal(h.frames.size,0);assert.equal(h.observer.disconnected,true);
});

test('sidebar scrollbar space remains stable across its overflow threshold', async () => {
  const css=await readFile(new URL('../sdk/web/page-sidebar.css',import.meta.url),'utf8');
  assert.match(css,/\.page-sidebar-list\s*\{[^}]*scrollbar-gutter:\s*stable/);
});
