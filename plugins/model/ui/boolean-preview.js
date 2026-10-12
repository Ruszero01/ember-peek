import {nativeGeometry} from './model-loaders.js';
import {meshStatistics} from './model-policy.js';

export const BOOLEAN_TIMEOUT = 250;
export function refineBooleans(root,onApplied,{makeWorker=(_code,url)=>new Worker(url),loadCode=()=>fetch(new URL('./vendor/csg-worker.js',import.meta.url)).then(r=>{if(!r.ok)throw Error('Missing boolean worker');return r.blob();}),timeout=BOOLEAN_TIMEOUT}={}) {
  const targets=[];root.traverse(node=>{if(node.userData.boolean)targets.push(node);});
  let stopped=false,worker,timer,url;
  const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);worker?.terminate();if(url)URL.revokeObjectURL(url);for(const node of targets)delete node.userData.boolean;};
  if(!targets.length)return stop;
  (async()=>{
    try{
      const code=await loadCode();if(stopped)return;
      // Create after first presentation. This isolated worker can be terminated mid-computation.
      url=URL.createObjectURL(code);worker=makeWorker(code,url);timer=setTimeout(stop,timeout);
      const applied=new Set();
      worker.onmessage=({data})=>{
        if(stopped)return;if(data.done){stop();return;}
        if(!Number.isSafeInteger(data.id)||data.id<0||data.id>=targets.length||applied.has(data.id)||data.error)return;
        try{
          if(!(data.values instanceof Float32Array)||data.values.length>20000*27)return;
          const replacement=nativeGeometry(new Uint8Array(data.values.buffer,data.values.byteOffset,data.values.byteLength)),target=targets[data.id];
          try{meshStatistics(replacement);}catch(error){replacement.geometry.dispose();replacement.material.dispose();throw error;}
          replacement.geometry.computeBoundingBox();target.geometry.dispose();target.geometry=replacement.geometry;replacement.material.dispose();
          applied.add(data.id);onApplied(target,data.elapsed);
        }catch{stop();}
      };
      worker.onerror=stop;
      const jobs=targets.map(node=>node.userData.boolean);worker.postMessage(jobs,jobs.flatMap(job=>[job.a.buffer,job.b.buffer]));
    }catch{stop();}
  })();
  return stop;
}
