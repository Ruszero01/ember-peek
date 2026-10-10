import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {runInNewContext} from 'node:vm';
const module={exports:{}};
runInNewContext(transformSync(readFileSync(new URL('../src/toolbar-layout.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports});
const {toolbarMinimumWidth,toolbarWheelPosition,toolbarRowWidth,toolbarNeedsResize,toolbarScrollSpacing}=module.exports;
test('minimum width fits the action row but stays bounded on small screens and long plugin lists',()=>{
 assert.equal(toolbarMinimumWidth(306,36,1920),486);
 assert.equal(toolbarMinimumWidth(90,36,1920),320);
 assert.equal(toolbarMinimumWidth(4000,36,1920),800);
 assert.equal(toolbarMinimumWidth(4000,36,600),480);
 assert.equal(toolbarMinimumWidth(4000,36,300),320);
});
test('vertical wheel and horizontal trackpad input reveal clipped controls in either direction',()=>{
 const wheel=(deltaX,deltaY,deltaMode=0,ctrlKey=false)=>({deltaX,deltaY,deltaMode,ctrlKey});
 assert.equal(toolbarWheelPosition(0,500,200,wheel(0,90)),90);
 assert.equal(toolbarWheelPosition(100,500,200,wheel(-60,2)),40);
 assert.equal(toolbarWheelPosition(290,500,200,wheel(0,90)),300);
 assert.equal(toolbarWheelPosition(20,500,200,wheel(0,-90)),0);
 assert.equal(toolbarWheelPosition(0,500,200,wheel(0,2,1)),60);
 assert.equal(toolbarWheelPosition(0,500,200,wheel(0,1,2)),200);
 assert.equal(toolbarWheelPosition(80,500,200,wheel(0,90,0,true)),80);
 assert.equal(toolbarWheelPosition(0,100,200,wheel(0,90)),0);
});

test('all plugin groups, host actions, gaps and actual file information contribute to minimum width',()=>{
 const actions=toolbarRowWidth([319.5,101.5],6);
 assert.equal(actions,427);
 assert.equal(toolbarMinimumWidth(actions,36,2560,143),630);
 assert.equal(toolbarMinimumWidth(toolbarRowWidth([319.5,60,101.5],6),36,2560,143),696);
 assert.equal(toolbarRowWidth([],6),0);
});

test('a new constraint enlarges an undersized window once, without fighting subsequent edge drags',()=>{
 assert.equal(toolbarNeedsResize(608,621),true);
 assert.equal(toolbarNeedsResize(621,621),false);
 assert.equal(toolbarNeedsResize(900,621),false);
});

test('edge dragging and pixel rounding do not trigger repeated corrective resize requests',()=>{
 for(const width of [621,620.67,620,608,621]) assert.equal(toolbarNeedsResize(width,621,621),false);
 assert.equal(toolbarNeedsResize(608,621,562),true);
});


test('minimum width excludes the unused auto alignment gap',()=>{
 const spacing=toolbarScrollSpacing(4,4,-4);
 assert.equal(spacing,4);
 const content=toolbarRowWidth([261.3],6)+spacing+101.3+12;
 assert.equal(toolbarMinimumWidth(content,36,2560,144.7),584);
});
