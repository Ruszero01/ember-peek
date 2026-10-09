import test from "node:test";
import assert from "node:assert/strict";
import { command, positionState, objectBounds, pageGeometry, imageBase64, canSelect, renderPosition, imageResize, cancelResizeKey } from "../plugins/pdf-editor/ui/document.js";

test("an asynchronous raster redraw preserves newer user scrolling but honors explicit page restoration",()=>{
  const requested={page:2,x:0,y:0.25},current={page:2,x:0,y:0.4},started={top:200,left:0};
  assert.equal(renderPosition(requested,current,started,{scrollTop:300,scrollLeft:0},true),current);
  assert.equal(renderPosition(requested,current,started,{scrollTop:200,scrollLeft:0},true),requested);
  assert.equal(renderPosition(requested,current,started,{scrollTop:300,scrollLeft:0},false),requested);
});

test("objects remain selectable during same-page resizing but never during edits or stale renders",()=>{
  const state={editable:true,revision:7};
  assert.equal(canSelect(state,{revision:7,page:2},2,false),true);
  assert.equal(canSelect(state,{revision:6,page:2},2,false),false);
  assert.equal(canSelect(state,{revision:7,page:1},2,false),false);
  assert.equal(canSelect(state,{revision:7,page:2},2,true),false);
  assert.equal(canSelect({...state,editable:false},{revision:7,page:2},2,false),false);
});

test("PDF editor sends the current revision and clamps navigation after deleting a page",()=>{
  assert.deepEqual(command({revision:7,pages:3},4,{object:9,text:"Changed",revision:1,page:100}),{object:9,text:"Changed",revision:7,page:3});
  assert.deepEqual(positionState({page:4,x:-1,y:0.4},3),{page:3,x:0,y:0.4});
  assert.deepEqual(positionState({page:NaN,x:Infinity,y:NaN},4),{page:1,x:0,y:0});
});
test("PDF object selection follows rendered pixels independently of CSS zoom",()=>{
  assert.deepEqual(objectBounds({bounds:[100,200,200,80]},1000,2000),{left:"10%",top:"10%",width:"20%",height:"4%"});
  assert.deepEqual(pageGeometry(400,600,800,800,true),{width:800,height:1200,scale:2});
  const whole=pageGeometry(400,600,800,800,false);
  assert.equal(whole.height,800);
  assert.deepEqual(pageGeometry(400,600,800,800,true,0.5),{width:200,height:300,scale:0.5});
});
test("replacement images are binary-safe and bounded before sending to the native editor",async()=>{
  const bytes=Uint8Array.from({length:140000},(_,index)=>index%256);
  const file={type:"image/png",size:bytes.length,arrayBuffer:async()=>bytes.buffer};
  assert.deepEqual(Buffer.from(await imageBase64(file),"base64"),Buffer.from(bytes));
  await assert.rejects(()=>imageBase64({...file,size:4*1024*1024+1}),/4 MiB/);
  await assert.rejects(()=>imageBase64({...file,type:"image/svg+xml"}),/PNG or JPEG/);
});

test("image corner dragging preserves aspect ratio and anchors the opposite corner within the page",()=>{
  const se=imageResize([0.1,0.2,0.2,0.1],"se",0.1,0.05,1,1);
  assert.ok(Math.abs(se.scale-1.5)<1e-9);
  assert.deepEqual(se.bounds.slice(0,2),[0.1,0.2]);
  const nw=imageResize([0.1,0.2,0.2,0.1],"nw",-0.1,-0.05,1,1);
  assert.ok(Math.abs(nw.bounds[0])<1e-9);
  assert.ok(Math.abs(nw.bounds[1]-0.15)<1e-9);
  for(const corner of ["nw","ne","sw","se"]){const value=imageResize([0.1,0.2,0.2,0.1],corner,100,100,1,1);const[x,y,w,h]=value.bounds;assert.ok(x>=-1e-9&&y>=-1e-9&&x+w<=1+1e-9&&y+h<=1+1e-9);assert.ok(Math.abs(w/h-2)<1e-9);}
});

test("Escape cancels an image drag before the SDK forwards it to host close",()=>{
  const calls=[];
  assert.equal(cancelResizeKey({key:"Escape",preventDefault:()=>calls.push("prevent"),stopPropagation:()=>calls.push("stop")},()=>calls.push("cancel")),true);
  assert.deepEqual(calls,["prevent","stop","cancel"]);
  assert.equal(cancelResizeKey({key:"ArrowLeft"},()=>assert.fail()),false);
});

test("free resizing adjusts axes independently and Shift preserves proportions",()=>{
  const free=imageResize([0.1,0.2,0.2,0.1],"se",0.1,0,1,1,false);
  assert.ok(Math.abs(free.scaleX-1.5)<1e-9);
  assert.equal(free.scaleY,1);
  assert.deepEqual(free.bounds.slice(0,2),[0.1,0.2]);
  const locked=imageResize([0.1,0.2,0.2,0.1],"se",0.1,0,1,1,true);
  assert.equal(locked.scaleX,locked.scaleY);
  const west=imageResize([0.1,0.2,0.2,0.1],"nw",-0.1,0,1,1,false);
  assert.ok(Math.abs(west.bounds[0])<1e-9);
  assert.ok(Math.abs(west.bounds[1]-0.2)<1e-9);
});
