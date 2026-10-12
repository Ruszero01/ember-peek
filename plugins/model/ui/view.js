import { ready, read, call, resourceUrl, resourceBlob, controls, status, loading, presented, translate, onLocale, onTheme, configuration, onSettings } from './sdk.js';
import * as T from './vendor/model.js';
import { loadModel, nativeGeometry, simplifyMaterials, disposeModel } from './model-loaders.js';
import { meshStatistics, MAX_BYTES } from './model-policy.js';
import { createGuides } from './guides.js';
import { modelAppearance } from './appearance.js';
import { decodeNativePayload, receiveNativePayload } from './model-transfer.js';
import { refineBooleans } from './boolean-preview.js';

const {data}=await ready;
const canvas=document.querySelector('canvas'),thumbnail=document.querySelector('#thumbnail');
const say=translate({
  'zh-CN':{receiving:'正在加载模型… {percent}%',building:'正在准备模型…',simplified:' · 已简化密集网格',ground:'地面网格',axes:'坐标轴',loading:'正在读取模型…',fit:'适应窗口',reset:'复位视角',zoom:'缩放比例',wire:'线框',lineInfo:'{objects} 个对象 · {lines} 条线段',lineCount:' · {lines} 条线段',info:'{objects} 个对象 · {triangles} 个三角形',base:' · 基础几何预览',partial:' · {count} 个对象未计算',resource:' · 部分材质资源缺失',thumbnail:'仅保存的预览图，无法旋转；未读到可用网格或线条',hint:'左键旋转 · 滚轮缩放 · 右键平移',error:'模型预览失败：{error}'},
  en:{receiving:'Loading model… {percent}%',building:'Preparing model…',simplified:' · Dense meshes simplified',ground:'Ground grid',axes:'Axes',loading:'Reading model…',fit:'Fit the window',reset:'Reset view',zoom:'Zoom',wire:'Wireframe',lineInfo:'{objects} objects · {lines} line segments',lineCount:' · {lines} line segments',info:'{objects} objects · {triangles} triangles',base:' · Saved base geometry',partial:' · {count} objects not evaluated',resource:' · Some material resources are missing',thumbnail:'Saved preview image only; no usable base geometry for orbiting',hint:'Drag to orbit · Wheel to zoom · Right-drag to pan',error:'Model preview failed: {error}'},
});
let renderer,orbit,root,scene,camera,stats,nativeInfo,frame,baseDistance=1,wire=false,zoomPublished,warnings=false,disposed=false,thumbnailUrl;
let guides;
let cancelBoolean=()=>{};
const touched=new Set();
function applyDefaults(){
  if(!guides)return;
  const next=modelAppearance(configuration(),{ground:guides.ground.visible,axes:guides.axes.visible,wire},touched);
  guides.ground.visible=next.ground;guides.axes.visible=next.axes;wire=next.wire;
  root.traverse(node=>{if(node.isMesh)for(const material of [].concat(node.material))material.wireframe=wire;});
  zoomPublished=undefined;paint();
}
loading();status('');
function message(){
  if(!stats)return;
  status((nativeInfo?.lines && !stats.triangles?say('lineInfo',{...stats,lines:nativeInfo.lines}):say('info',stats)+(nativeInfo?.lines?say('lineCount',{lines:nativeInfo.lines}):''))+(nativeInfo?say('base'):'')+(nativeInfo?.simplified?say('simplified'):'')+(nativeInfo?.skipped?say('partial',{count:nativeInfo.skipped}):'')+(warnings?say('resource'):''));
}
function publish(){
  const zoom=Math.round(baseDistance/camera.position.distanceTo(orbit.target)*100);
  if(zoomPublished===zoom)return;zoomPublished=zoom;
  controls([
    {id:'zoom',kind:'scrub',label:say('zoom'),value:zoom,min:10,max:1000,suffix:'%',run:value=>{
      if(typeof value!=='number'||!Number.isFinite(value))return;
      const direction=camera.position.clone().sub(orbit.target).normalize();camera.position.copy(orbit.target).addScaledVector(direction,baseDistance/(Math.max(10,Math.min(1000,value))/100));orbit.update();paint();
    }},
    {id:'fit',kind:'button',label:say('fit'),icon:'maximize-2',run:()=>fit(false)},
    {id:'reset',kind:'button',label:say('reset'),icon:'rotate-ccw',run:()=>fit(true)},
    {id:'wire',kind:'toggle',label:say('wire'),icon:'box',active:wire,run:()=>{
      touched.add('wire');
      wire=!wire;root.traverse(node=>{if(node.isMesh)for(const material of [].concat(node.material))material.wireframe=wire;});zoomPublished=undefined;paint();
    }},
    {id:'ground',kind:'toggle',label:say('ground'),icon:'grid-3x3',active:guides.ground.visible,run:()=>{touched.add('ground');guides.ground.visible=!guides.ground.visible;zoomPublished=undefined;paint();}},
    {id:'axes',kind:'toggle',label:say('axes'),icon:'move-3d',active:guides.axes.visible,run:()=>{touched.add('axes');guides.axes.visible=!guides.axes.visible;zoomPublished=undefined;paint();}},
  ]);
}
function paint(){if(disposed||!renderer||frame)return;frame=requestAnimationFrame(()=>{frame=undefined;renderer.render(scene,camera);publish();});}
function fit(reset){
  const bounds=new T.Box3().setFromObject(root),center=bounds.getCenter(new T.Vector3()),radius=bounds.getSize(new T.Vector3()).length()/2;
  const angle=T.MathUtils.degToRad(camera.fov/2);
  baseDistance=radius/Math.sin(Math.atan(Math.tan(angle)*Math.min(1,camera.aspect)))*1.15;
  const direction=reset?new T.Vector3(1,0.65,1).normalize():camera.position.clone().sub(orbit.target).normalize();
  orbit.target.copy(center);camera.position.copy(center).addScaledVector(direction,baseDistance);
  orbit.minDistance=baseDistance/10;orbit.maxDistance=baseDistance*10;camera.near=Math.max(radius/1000,0.0001);camera.far=baseDistance*30;
  camera.updateProjectionMatrix();orbit.update();paint();
}
function resize(){if(!renderer)return;renderer.setSize(Math.max(1,innerWidth),Math.max(1,innerHeight),false);camera.aspect=innerWidth/Math.max(1,innerHeight);camera.updateProjectionMatrix();paint();}
function recolor(){if(!scene)return;scene.background=null;paint();}
function dispose(){disposed=true;cancelBoolean();if(frame)cancelAnimationFrame(frame);orbit?.dispose();disposeModel(root);disposeModel(guides?.group);renderer?.dispose();renderer?.forceContextLoss();if(thumbnailUrl)URL.revokeObjectURL(thumbnailUrl);}
async function currentBytes(){
  if(!Number.isSafeInteger(data.size)||data.size<=0||data.size>MAX_BYTES)throw new Error('Model exceeds the 1024 MiB quick preview limit');
  const bytes=new Uint8Array(data.size);
  for(let offset=0;offset<bytes.length;offset+=1024*1024){const length=Math.min(1024*1024,bytes.length-offset),chunk=await read(offset,length);if(chunk.length!==length)throw new Error('Truncated model file');bytes.set(chunk,offset);}
  return bytes;
}
async function savedMesh(){
  performance.mark('model-native-start');
  nativeInfo=await call('render');
  performance.mark('model-native-ready');
  if(!Number.isSafeInteger(nativeInfo.size)||nativeInfo.size<=0||nativeInfo.size>MAX_BYTES)throw new Error('Invalid saved model payload');
  const bytes=await receiveNativePayload(nativeInfo.size,value=>call('bytes',value),percent=>loading(percent/100));
  performance.mark('model-transfer-ready');
  if(nativeInfo.kind==='thumbnail'){
    thumbnailUrl=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));thumbnail.src=thumbnailUrl;await thumbnail.decode();thumbnail.hidden=false;
    canvas.hidden=true;controls([]);status(say('thumbnail'));presented();return null;
  }
  loading();
  const decoded=await decodeNativePayload(bytes,nativeInfo);
  performance.mark('model-decoded');
  return nativeGeometry(decoded,nativeInfo.booleans??[],nativeInfo);
}
try{
  root=['c4d','blend'].includes(data.format)?await savedMesh():await loadModel(data.format,(await currentBytes()).buffer,{resourceUrl,resourceBlob,onResourceLoaded:paint,onWarning:()=>{warnings=true;message();paint();}});
  if(root){
    stats=meshStatistics(root);if(nativeInfo)stats.objects=nativeInfo.objects;simplifyMaterials(root);
    // Normalize around the asset bounds so source units do not affect orbit/pan sensitivity.
    const bounds=new T.Box3().setFromObject(root);if(bounds.isEmpty())throw new Error('No visible model geometry');
    const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),span=Math.max(size.x,size.y,size.z);
    if(!Number.isFinite(span)||span<=1e-12)throw new Error('Invalid model extent');
    const content=root;root=new T.Group();root.add(content);content.position.sub(center);root.scale.setScalar(2/span);
    scene=new T.Scene();scene.add(root);scene.add(new T.HemisphereLight(0xffffff,0x4c5668,2));
    guides=createGuides(root);scene.add(guides.group);
    const light=new T.DirectionalLight(0xffffff,2.2);light.position.set(3,4,5);scene.add(light);
    camera=new T.PerspectiveCamera(42,innerWidth/Math.max(1,innerHeight),0.001,100);camera.position.set(3,2,3);
    renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    orbit=new T.OrbitControls(camera,canvas);orbit.enableDamping=false;orbit.addEventListener('change',paint);
    canvas.setAttribute('aria-label',say('hint'));canvas.addEventListener('contextmenu',event=>event.preventDefault());
    // Texture completion is asynchronous for several loaders. Redraw only when an image arrives.
    root.traverse(node=>{for(const material of [].concat(node.material??[])){material.map?.source?.data?.addEventListener?.('load',paint);}});
    applyDefaults();resize();recolor();fit(true);renderer.render(scene,camera);message();performance.mark('model-presented');presented();
    if(nativeInfo?.booleans?.length)requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(disposed)return;
      cancelBoolean=refineBooleans(root,()=>{
        if(disposed)return;
        stats=meshStatistics(root);stats.objects=nativeInfo.objects;nativeInfo.skipped=Math.max(0,nativeInfo.skipped-1);message();paint();
      });
    }));
  }
}catch(error){dispose();presented(say('error',{error:String(error.message??error)}));}
addEventListener('resize',resize);addEventListener('pagehide',dispose,{once:true});
canvas.addEventListener('webglcontextlost',event=>{if(disposed)return;event.preventDefault();dispose();presented(say('error',{error:'Graphics context lost; reopen the preview'}));});
onTheme(recolor);onLocale(()=>{zoomPublished=undefined;if(nativeInfo?.kind==='thumbnail')status(say('thumbnail'));else{message();paint();}});
onSettings(applyDefaults);
