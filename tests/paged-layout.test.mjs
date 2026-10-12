import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {renderTarget} from '../plugins/powerpoint/ui/render-target.js';
import * as geometry from '../sdk/web/paged-geometry.js';

function dom() {
  const document={createElement:()=>new Element()};
  class Element {
    constructor(){this.ownerDocument=document;this.style={};this.dataset={};this.children=[];this.classList={add(){}};this.clientWidth=1000;this.clientHeight=800;this.scrollTop=0;this.scrollLeft=0;this.events={};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    addEventListener(name,fn){this.events[name]=fn;}
    removeEventListener(name){delete this.events[name];}
    get offsetTop(){return 0;}
    get offsetWidth(){return parseFloat(this.style.width)||960;}
    get offsetHeight(){return parseFloat(this.style.height)||this.clientHeight;}
    getBoundingClientRect(){return {top:0,left:0,bottom:this.clientHeight,width:this.clientWidth,height:this.clientHeight};}
  }
  return {document,Element};
}
test('renderer mutations cannot replace paginated or offscreen positioning',()=>{
  const {Element}=dom();const parent=new Element();parent.style.position='absolute';
  const normal=renderTarget(parent,960,720);
  normal.target.style.position='relative';
  assert.equal(parent.style.position,'absolute');assert.equal(normal.frame.style.width,'960px');
  const offscreen=renderTarget(parent,960,720,true);offscreen.target.style.position='relative';offscreen.target.style.height='1440px';
  assert.equal(offscreen.frame.style.position,'fixed');assert.equal(offscreen.frame.style.height,'720px');assert.equal(offscreen.frame.style.contain,'strict');
});

test('unchanged viewport resize bursts do not relayout or remount document pages',async()=>{
  const {document,Element}=dom(),viewport=new Element(),content=new Element(),frames=new Map();
  let observer,controls=0,mounts=0,id=0;
  const sdk={controls(){controls++;},status(){},shortcuts:async()=>{},configuration:()=>({viewMode:'continuous'}),onSettings:()=>()=>{},onLocale:()=>()=>{},translate:()=>key=>key};
  const context=vm.createContext({sdk,geometry,document,getComputedStyle:()=>({paddingTop:'0',paddingBottom:'0',paddingLeft:'0',paddingRight:'0'}),
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key),addEventListener(){},
    ResizeObserver:class{constructor(fn){this.callback=fn;observer=this;}observe(){}disconnect(){}}});
  const source=(await readFile(new URL('../sdk/web/paged-document.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace('export async function','async function');
  vm.runInContext('const {controls,status,shortcuts,configuration,onSettings,onLocale,translate}=sdk;const {documentPreferences,documentZoom,pageGeometry,pageNeighborhood,documentViewportSize}=geometry;\n'+source+'\nglobalThis.start=pagedDocument;',context);
  await context.start({viewport,content,dimensions:[[960,720]],mount:async()=>{mounts++;},navigation:{control:()=>({}),changed(){}}});
  viewport.style.height='800px';
  const baseline=controls;
  for(let n=0;n<100;n++)observer.callback();assert.equal(frames.size,1);
  const flush=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};flush();
  assert.equal(controls,baseline);assert.equal(mounts,1);
  viewport.clientHeight=792;observer.callback();flush();
  assert.equal(controls,baseline);
  viewport.clientWidth=980;observer.callback();flush();await Promise.resolve();
  assert.equal(controls,baseline+1);assert.equal(mounts,1);
});

test('transformed page geometry cannot add a second scrolling layout',async()=>{
  const css=await readFile(new URL('../sdk/web/paged-document.css',import.meta.url),'utf8');
  assert.match(css,/html, body\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css,/\.document-page\s*\{[^}]*overflow:\s*clip/);
});

test('fill geometry stays stable when horizontal scrollbar presence changes',()=>{
  const css={paddingLeft:'16px',paddingRight:'16px',paddingTop:'80px',paddingBottom:'98px'};
  const viewport={clientWidth:960,clientHeight:880,offsetHeight:880};
  const before=geometry.documentViewportSize(viewport,css,'fill');
  viewport.clientHeight=872;
  assert.deepEqual(geometry.documentViewportSize(viewport,css,'fill'),before);
  assert.deepEqual(before,{width:928,height:702});
  assert.deepEqual(geometry.documentViewportSize(viewport,css,'page'),{width:928,height:694});
});
