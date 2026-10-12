import * as T from './vendor/model.js';
import { localReference, MAX_BYTES } from './model-policy.js';

export function nativeGeometry(bytes, jobs = [], layout = null) {
  if(layout && layout.lines) {
    const {meshTriangles,lines}=layout;
    if(!Number.isSafeInteger(meshTriangles)||meshTriangles<0||meshTriangles>4000000||!Number.isSafeInteger(lines)||lines<0||lines>1000000||bytes.byteLength!==meshTriangles*108+lines*72)throw Error('Invalid saved line payload');
    const group=new T.Group();
    if(meshTriangles)group.add(nativeGeometry(bytes.subarray(0,meshTriangles*108),jobs));
    else if(jobs.length)throw Error('Boolean jobs require mesh geometry');
    const floats=new Float32Array(bytes.buffer,bytes.byteOffset+meshTriangles*108,lines*18);
    if(floats.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))throw Error('Invalid saved line values');
    const buffer=new T.InterleavedBuffer(floats,9),geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.InterleavedBufferAttribute(buffer,3,0));
    geometry.setAttribute('color',new T.InterleavedBufferAttribute(buffer,3,6));
    group.add(new T.LineSegments(geometry,new T.LineBasicMaterial({vertexColors:true})));
    return group;
  }
  if(!Array.isArray(jobs))throw Error('Invalid boolean jobs');
  if (bytes.byteLength===0 || bytes.byteLength%108!==0 || bytes.byteLength>4000000*108) throw new Error('Invalid saved mesh payload');
  const floats=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  if (floats.some(v=>!Number.isFinite(v))) throw new Error('Invalid saved mesh values');
  if(jobs.length){
    if(jobs.length>4)throw Error('Too many boolean jobs');
    const group=new T.Group();let cursor=0;const triangles=bytes.byteLength/108;
    for(const job of jobs){
      const {start,count,cutter_start,cutter_count}=job;
      if(![start,count,cutter_start,cutter_count].every(Number.isSafeInteger)||start<cursor||count<=0||cutter_count<=0||cutter_start!==start+count||cutter_start+cutter_count>triangles||count+cutter_count>6000)throw Error('Invalid boolean range');
      if(start>cursor)group.add(nativeGeometry(bytes.subarray(cursor*108,start*108)));
      const operand=nativeGeometry(bytes.subarray(start*108,cutter_start*108));
      operand.userData.boolean={a:floats.slice(start*27,cutter_start*27),b:floats.slice(cutter_start*27,(cutter_start+cutter_count)*27)};
      group.add(operand);cursor=cutter_start+cutter_count;
    }
    if(cursor<triangles)group.add(nativeGeometry(bytes.subarray(cursor*108)));
    return group;
  }
  const interleaved=new T.InterleavedBuffer(floats,9),geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.InterleavedBufferAttribute(interleaved,3,0));
  geometry.setAttribute('normal',new T.InterleavedBufferAttribute(interleaved,3,3));
  geometry.setAttribute('color',new T.InterleavedBufferAttribute(interleaved,3,6));
  return new T.Mesh(geometry,new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide}));
}
function zipBudget(bytes) {
  const view=new DataView(bytes);let total=0,entries=0;
  for(let i=Math.max(0,bytes.byteLength-65557);i+22<=bytes.byteLength;i++){
    if(view.getUint32(i,true)!==0x06054b50)continue;
    let offset=view.getUint32(i+16,true);const count=view.getUint16(i+10,true);
    if(count>4096)throw new Error('Too many model archive entries');
    for(let n=0;n<count;n++){
      if(offset+46>bytes.byteLength || view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid model archive');
      const size=view.getUint32(offset+24,true);total+=size;entries++;
      if(total>MAX_BYTES || size>MAX_BYTES)throw new Error('Expanded model archive exceeds 1024 MiB');
      offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
    }
    if(entries!==count)throw new Error('Invalid model archive');return;
  }
  throw new Error('Invalid 3MF archive');
}
export async function loadModel(format,bytes,{resourceUrl,resourceBlob,onWarning=()=>{},onResourceLoaded=()=>{}}={}) {
  if(bytes.byteLength===0 || bytes.byteLength>MAX_BYTES)throw new Error('Model must be at most 1024 MiB');
  const manager=new T.LoadingManager();
  manager.setURLModifier(url=>resourceUrl(localReference(url)));
  manager.onError=()=>onWarning('resource');
  manager.onLoad=onResourceLoaded;
  const text=()=>new TextDecoder().decode(bytes);
  switch(format){
    case 'glb':case 'gltf':return (await new T.GLTFLoader(manager).parseAsync(bytes,'')).scene;
    case 'fbx':return new T.FBXLoader(manager).parse(bytes,'');
    case 'dae':return new T.ColladaLoader(manager).parse(text(),'').scene;
    case '3ds':return new T.TDSLoader(manager).parse(bytes,'');
    case '3mf':zipBudget(bytes);return new T.ThreeMFLoader(manager).parse(bytes);
    case 'obj':{
      const source=text(),loader=new T.OBJLoader(manager);
      // Read only bounded, declared material libraries. Missing materials leave base geometry usable.
      const libraries=[...source.matchAll(/^\s*mtllib\s+(.+)$/gm)].map(m=>m[1].trim()).slice(0,8);
      const creators=[];
      for(const reference of libraries){try{
        const blob=await resourceBlob(localReference(reference));
        if(blob.size>4*1024*1024)throw new Error('Material library exceeds preview limit');
        const base=reference.replaceAll('\\','/').replace(/[^/]*$/,'');
        const creator=new T.MTLLoader(manager).parse(await blob.text(),base);
        creators.push(creator);
      }catch{onWarning('resource');}}
      if(creators.length)loader.setMaterials({create(name){const creator=creators.find(c=>Object.hasOwn(c.materialsInfo,name));return creator?creator.create(name):new T.MeshLambertMaterial({color:0x8d9eb3});}});
      return loader.parse(source);
    }
    case 'stl':case 'ply':{
      const geometry=format==='stl'?new T.STLLoader(manager).parse(bytes):new T.PLYLoader(manager).parse(bytes);
      const colors=Boolean(geometry.getAttribute('color'));
      if(format==='ply' && !geometry.index)return new T.Points(geometry,new T.PointsMaterial({color:colors?0xffffff:0x8d9eb3,vertexColors:colors,size:0.015}));
      return new T.Mesh(geometry,new T.MeshLambertMaterial({color:colors?0xffffff:0x8d9eb3,vertexColors:colors,side:T.DoubleSide}));
    }
    default:throw new Error('Unsupported model format');
  }
}
export function simplifyMaterials(root){
  root.traverse(node=>{
    if(!node.isMesh)return;
    if(!node.geometry.getAttribute('normal'))node.geometry.computeVertexNormals();
    const simplify=original=>{
      const material=new T.MeshLambertMaterial({color:original?.color ?? 0x8d9eb3,map:original?.map ?? null,
        vertexColors:Boolean(node.geometry.getAttribute('color')),side:T.DoubleSide,
        transparent:original?.transparent ?? false,opacity:original?.opacity ?? 1,alphaTest:original?.alphaTest ?? 0});
      original?.dispose();return material;
    };
    node.material=Array.isArray(node.material)?node.material.map(simplify):simplify(node.material);
    node.castShadow=false;node.receiveShadow=false;
  });
}
export function disposeModel(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root?.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [].concat(node.material??[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
  for(const texture of textures){texture.source?.data?.close?.();texture.dispose();}
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
}
