import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {decodeNativePayload,receiveNativePayload,modelChunk} from '../plugins/model/ui/model-transfer.js';
import {readFileSync} from 'node:fs';
import {loadModel,nativeGeometry,simplifyMaterials,disposeModel} from '../plugins/model/ui/model-loaders.js';
import {localReference,meshStatistics,MAX_BYTES} from '../plugins/model/ui/model-policy.js';
import {createGuides} from '../plugins/model/ui/guides.js';
import {modelAppearance} from '../plugins/model/ui/appearance.js';

const bytes=source=>new TextEncoder().encode(source).buffer;
const options={resourceUrl:reference=>reference,resourceBlob:async()=>{throw new Error('missing resource');}};
// Three's streaming loader reports browser progress events; Node has no ProgressEvent.
globalThis.ProgressEvent ??= class extends Event {constructor(type,init={}){super(type);Object.assign(this,init);}};
function gltf(){
  const positions=new Float32Array([0,0,0,1,0,0,0,1,0]);
  return {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],
    materials:[{pbrMetallicRoughness:{baseColorFactor:[0.8,0.1,0.05,1]}}],
    buffers:[{byteLength:36,uri:'data:application/octet-stream;base64,'+Buffer.from(positions.buffer).toString('base64')}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
}
function glb(){const document=gltf();delete document.buffers[0].uri;let json=Buffer.from(JSON.stringify(document));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer);const output=Buffer.alloc(12+8+json.length+8+bin.length);output.write('glTF');output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(json.length,12);output.writeUInt32LE(0x4e4f534a,16);json.copy(output,20);const offset=20+json.length;output.writeUInt32LE(bin.length,offset);output.writeUInt32LE(0x004e4942,offset+4);bin.copy(output,offset+8);return output.buffer.slice(output.byteOffset,output.byteOffset+output.length);}

test('web loaders share geometry and retain base color for GLB/glTF, OBJ, STL and PLY',async()=>{
  const samples=[['gltf',bytes(JSON.stringify(gltf()))],['glb',glb()],
    ['obj',bytes('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')],
    ['stl',bytes('solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle')],
    ['ply',bytes('ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n')]];
  for(const [format,input] of samples){const model=await loadModel(format,input,options);assert.equal(meshStatistics(model).triangles,1,format);simplifyMaterials(model);if(['gltf','glb'].includes(format))model.traverse(node=>{if(node.isMesh){assert.ok(node.material.isMeshLambertMaterial);assert.ok(Math.abs(node.material.color.r-0.8)<0.001);}});disposeModel(model);}
});
test('OBJ missing MTL retains basic geometry and reports incomplete resources',async()=>{
  let warnings=0;const model=await loadModel('obj',bytes('mtllib missing.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'),{...options,onWarning:()=>warnings++});
  assert.equal(meshStatistics(model).triangles,1);assert.equal(warnings,1);disposeModel(model);
});
test('local model resources reject network paths and unsafe schemes',()=>{
  const embedded='data:application/octet-stream;base64,'+'A'.repeat(5000);
  assert.equal(localReference(embedded),embedded);
  for(const reference of ['../textures/color.png','C:\\assets\\color.png','file:///C:/assets/color.png','data:image/png;base64,AA==','blob:http://plugin.localhost/a'])assert.equal(localReference(reference),reference);
  for(const reference of ['https://example.com/model.bin','//server/share','\\\\server\\share','file://server/share/image.png','file:////server/share/image.png','javascript:alert(1)','texture\u0000.png'])assert.throws(()=>localReference(reference));
});
test('ground and axes start hidden, sit below the model and do not alter asset statistics',async()=>{
  const root=await loadModel('obj',bytes('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'),options);
  const original=meshStatistics(root),guides=createGuides(root);
  assert.equal(guides.ground.visible,false);assert.equal(guides.axes.visible,false);
  assert.ok(guides.ground.position.y<0);assert.equal(guides.axes.position.y,guides.ground.position.y);
  guides.ground.visible=true;guides.axes.visible=true;
  assert.deepEqual(meshStatistics(root),original);
  disposeModel(guides.group);disposeModel(root);
});
test('model defaults initialize each view and retain only its temporary toolbar changes',()=>{
  assert.deepEqual(modelAppearance({}),{ground:false,axes:false,wire:false});
  assert.deepEqual(modelAppearance({ground:true,axes:true,wire:true}),{ground:true,axes:true,wire:true});
  assert.deepEqual(modelAppearance({ground:false,axes:true,wire:true},{ground:true,axes:false,wire:false},new Set(['ground'])),{ground:true,axes:true,wire:true});
  assert.equal(modelAppearance({wire:'true'}).wire,false);
});
test('native mesh payload and web model budgets fail explicitly',async()=>{
  assert.throws(()=>nativeGeometry(new Uint8Array(1)));const floats=new Float32Array(27);floats[0]=NaN;assert.throws(()=>nativeGeometry(new Uint8Array(floats.buffer)));
  const invalid=await loadModel('obj',bytes('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 20\n'),options);assert.throws(()=>meshStatistics(invalid));disposeModel(invalid);
  await assert.rejects(loadModel('glb',new ArrayBuffer(MAX_BYTES+1),options));
});
test('model plugin declares only read permissions and a standalone view',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../plugins/model/plugin.json',import.meta.url)));
  assert.deepEqual(manifest.permissions,['readFile','readResources']);
  for(const extension of ['c4d','blend','glb','gltf','obj','fbx','stl','ply'])assert.ok(manifest.extensions.includes(extension));
  assert.deepEqual(manifest.capabilities,['view','controls']);
});

test('large native meshes retain every triangle above the previous preview limit',()=>{
  const triangles=600001;
  const packed=new Uint8Array(triangles*108);
  const root=nativeGeometry(packed);
  assert.equal(meshStatistics(root).triangles,triangles);
  disposeModel(root);
});
test('compressed native transfer preserves bytes and enforces the expanded length',async()=>{
  const raw=new Uint8Array(216);raw[0]=12;raw[215]=34;
  const packed=new Uint8Array(gzipSync(raw));
  assert.deepEqual(await decodeNativePayload(packed,{encoding:'gzip',decodedSize:raw.length}),raw);
  await assert.rejects(decodeNativePayload(packed,{encoding:'gzip',decodedSize:raw.length-1}));
  await assert.rejects(decodeNativePayload(packed,{encoding:'gzip',decodedSize:raw.length+1}));
  await assert.rejects(decodeNativePayload(packed.subarray(0,packed.length-2),{encoding:'gzip',decodedSize:raw.length}));
  await assert.rejects(decodeNativePayload(packed,{encoding:'gzip',decodedSize:4000000*108+1}));
});

test('native chunks preserve order with bounded concurrent transfer',async()=>{
  const size=5*2*1024*1024+17,expected=new Uint8Array(size);
  for(let i=0;i<size;i++)expected[i]=i%251;
  let pending=0,peak=0;const progress=[];
  const actual=await receiveNativePayload(size,async({offset,length})=>{
    peak=Math.max(peak,++pending);
    await new Promise(resolve=>setTimeout(resolve,offset===0?10:1));
    pending--;
    return Buffer.from(expected.subarray(offset,offset+length)).toString('base64');
  },p=>progress.push(p));
  assert.deepEqual(actual,expected);assert.equal(peak,4);assert.equal(progress.at(-1),100);
  await assert.rejects(receiveNativePayload(10,async()=>Buffer.from([1]).toString('base64')));
  assert.deepEqual(modelChunk('AQIDBA=='),new Uint8Array([1,2,3,4]));
});


test('native line-only and mixed geometry remain orbitable geometry with independent colors',()=>{
  const input=new Float32Array([-1,0,0,0,0,0,1,0,0, 1,0,0,0,0,0,1,0,0]);
  const source=new Uint8Array(input.buffer);
  const lines=nativeGeometry(source,[],{meshTriangles:0,lines:1});
  assert.equal(lines.children[0].isLineSegments,true);
  assert.equal(meshStatistics(lines).triangles,0);
  assert.equal(meshStatistics(lines).vertices,2);
  assert.equal(lines.children[0].geometry.getAttribute('color').getX(0),1);
  const mixed=new Uint8Array(108+72);mixed.set(source,108);
  const model=nativeGeometry(mixed,[],{meshTriangles:1,lines:1});
  assert.equal(meshStatistics(model).triangles,1);
  assert.equal(model.children[1].isLineSegments,true);
  for(const layout of [{meshTriangles:0,lines:2},{meshTriangles:-1,lines:1},{meshTriangles:0,lines:1000001}])assert.throws(()=>nativeGeometry(source,[],layout));
  const invalid=source.slice();new DataView(invalid.buffer).setFloat32(0,NaN,true);
  assert.throws(()=>nativeGeometry(invalid,[],{meshTriangles:0,lines:1}));
  disposeModel(lines);disposeModel(model);
});
