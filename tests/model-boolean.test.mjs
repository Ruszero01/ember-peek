import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,PlaneGeometry} from 'three';
import {subtract} from '../plugins/model/csg-core.mjs';
import {nativeGeometry,disposeModel} from '../plugins/model/ui/model-loaders.js';
import {meshStatistics} from '../plugins/model/ui/model-policy.js';
import {refineBooleans} from '../plugins/model/ui/boolean-preview.js';

function values(geometry){const g=geometry.index?geometry.toNonIndexed():geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),v=new Float32Array(p.count*9);for(let i=0;i<p.count;i++)v.set([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),0.8,0.2,0.1],i*9);g.dispose();geometry.dispose();return v;}
function volume(v){let total=0;for(let i=0;i<v.length;i+=27){const a=v.subarray(i,i+3),b=v.subarray(i+9,i+12),c=v.subarray(i+18,i+21);total+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}return Math.abs(total);}
function sample(){const a=values(new BoxGeometry(2,2,2)),b=values(new BoxGeometry(2,2,2).translate(1,0,0)),all=new Float32Array(a.length+b.length);all.set(a);all.set(b,a.length);const root=nativeGeometry(new Uint8Array(all.buffer),[{start:0,count:12,cutter_start:12,cutter_count:12}]);return {a,b,root};}
test('basic difference removes the cutter volume while retaining base color',()=>{
  const {a,b,root}=sample(),result=subtract(a,b);
  assert.ok(Math.abs(volume(result)-4)<0.001);assert.ok(result.length/27<20000);
  for(let i=6;i<result.length;i+=9)assert.ok(Math.abs(result[i]-0.8)<0.001);
  disposeModel(root);
});
test('open cutters and input over the small boolean budget are rejected',()=>{
  const {a,root}=sample();assert.throws(()=>subtract(a,values(new PlaneGeometry(2,2))),/closed solid/);
  assert.throws(()=>subtract(new Float32Array(6001*27),a),/budget/);disposeModel(root);
});
test('mirrored closed operands preserve the intended subtraction volume',()=>{
  const a=values(new BoxGeometry(2,2,2).scale(-1,1,1)),b=values(new BoxGeometry(2,2,2).scale(-1,1,1).translate(1,0,0));
  assert.ok(Math.abs(volume(subtract(a,b))-4)<0.001);
});
test('boolean operands expose only the base mesh, and reject invalid ranges',()=>{
  const {root}=sample();assert.equal(meshStatistics(root).triangles,12);disposeModel(root);
  assert.throws(()=>nativeGeometry(new Uint8Array(108),[{start:0,count:1,cutter_start:1,cutter_count:1}]),/range/);
});
test('worker timeout keeps the base view intact and terminates background work',async()=>{
  const {root}=sample(),target=root.children[0],original=target.geometry;let ended=0;
  const cancel=refineBooleans(root,()=>assert.fail('Timed-out work must not replace geometry'),{loadCode:async()=>new Blob(['']),makeWorker:()=>({postMessage(){},terminate(){ended++;}}),timeout:5});
  await new Promise(r=>setTimeout(r,20));assert.equal(ended,1);assert.equal(target.geometry,original);assert.equal(target.userData.boolean,undefined);cancel();assert.equal(ended,1);disposeModel(root);
});
test('successful refinement replaces only geometry and preserves toolbar appearance',async()=>{
  const {root}=sample(),target=root.children[0],original=target.geometry;target.material.wireframe=true;let applied=0,worker;
  refineBooleans(root,()=>{applied++;},{loadCode:async()=>new Blob(['']),makeWorker:()=>worker={terminate(){},postMessage(jobs){queueMicrotask(()=>{this.onmessage({data:{id:0,values:subtract(jobs[0].a,jobs[0].b),elapsed:1}});this.onmessage({data:{done:true}});});}}});
  await new Promise(r=>setTimeout(r,20));assert.equal(applied,1);assert.notEqual(target.geometry,original);assert.equal(target.material.wireframe,true);assert.equal(target.userData.boolean,undefined);assert.ok(meshStatistics(root).triangles>0);
  worker.onmessage({data:{id:0,error:true}});assert.equal(applied,1);disposeModel(root);
});
test('disposing while worker code loads prevents its creation',async()=>{
  const {root}=sample();let finish,created=false;
  const cancel=refineBooleans(root,()=>assert.fail(),{loadCode:()=>new Promise(r=>finish=r),makeWorker:()=>{created=true;}});
  cancel();finish(new Blob(['']));await Promise.resolve();await Promise.resolve();assert.equal(created,false);disposeModel(root);
});
