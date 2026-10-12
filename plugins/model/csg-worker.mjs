import {subtract} from './csg-core.mjs';
self.onmessage=({data})=>{
  for(const [id,job] of data.entries()){
    try{const start=performance.now(),values=subtract(job.a,job.b);self.postMessage({id,values,elapsed:performance.now()-start},[values.buffer]);}
    catch{self.postMessage({id,error:true});}
  }
  self.postMessage({done:true});
};
