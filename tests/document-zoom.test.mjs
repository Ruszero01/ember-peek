import test from 'node:test';
import assert from 'node:assert/strict';
import { captureZoomCenter, restoreZoomCenter } from '../sdk/web/document.js';

test('document zoom preserves the viewport center instead of the top-left corner', () => {
  const original = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0'});
  try {
    const viewport = {clientWidth:800,clientHeight:600,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:200,top:100})};
    const before = {getBoundingClientRect:()=>({left:300,top:200,width:600,height:400})};
    const anchor = captureZoomCenter(viewport,before);
    assert.deepEqual(anchor,{x:.5,y:.5});
    const after = {getBoundingClientRect:()=>({left:200,top:100,width:1200,height:800})};
    restoreZoomCenter(viewport,after,anchor);
    assert.equal(viewport.scrollLeft,200);assert.equal(viewport.scrollTop,100);
  } finally {globalThis.getComputedStyle=original;}
});

test('zoom center accounts for host safe padding and preserves an off-center reading point', () => {
  const original = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({paddingLeft:'8',paddingRight:'8',paddingTop:'72',paddingBottom:'48'});
  try {
    const viewport={clientWidth:800,clientHeight:600,scrollLeft:200,scrollTop:100,getBoundingClientRect:()=>({left:0,top:0})};
    const before={getBoundingClientRect:()=>({left:-200,top:-100,width:1200,height:800})};
    const anchor=captureZoomCenter(viewport,before);
    assert.deepEqual(anchor,{x:.5,y:.515});
    restoreZoomCenter(viewport,{getBoundingClientRect:()=>({left:-200,top:-100,width:2400,height:1600})},anchor);
    assert.equal(viewport.scrollLeft,800);assert.equal(viewport.scrollTop,512);
    assert.equal(captureZoomCenter(viewport,null),null);
  } finally {globalThis.getComputedStyle=original;}
});
