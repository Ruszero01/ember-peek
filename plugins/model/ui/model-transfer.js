import { MAX_TRIANGLES } from './model-policy.js';
export async function decodeNativePayload(bytes, info) {
  const limit=MAX_TRIANGLES*108+1000000*72;
  if(info.encoding===undefined || info.encoding==='raw') {
    if(bytes.length>limit)throw Error('Saved mesh payload is too large');
    return bytes;
  }
  if(info.encoding!=='gzip'||!Number.isSafeInteger(info.decodedSize)||info.decodedSize<=0||info.decodedSize>limit)throw Error('Invalid compressed mesh payload');
  const output=new Uint8Array(info.decodedSize);
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  let offset=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();if(done)break;
      if(offset+value.length>output.length)throw Error('Expanded mesh exceeds declared size');
      output.set(value,offset);offset+=value.length;
    }
    if(offset!==output.length)throw Error('Truncated compressed mesh');
    return output;
  } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
}

export function modelChunk(encoded) {
  if(typeof Uint8Array.fromBase64==='function')return Uint8Array.fromBase64(encoded);
  const value=atob(encoded),bytes=new Uint8Array(value.length);
  for(let i=0;i<bytes.length;i++)bytes[i]=value.charCodeAt(i);
  return bytes;
}
export async function receiveNativePayload(size, read, progress=()=>{}) {
  if(!Number.isSafeInteger(size)||size<=0||size>1024*1024*1024)throw Error('Invalid saved model payload');
  const bytes=new Uint8Array(size),chunkSize=2*1024*1024;
  let completed=0;
  // Bound outstanding RPCs and place results by offset, even if replies arrive out of order.
  for(let base=0;base<size;base+=chunkSize*4){
    const jobs=[];
    for(let offset=base;offset<Math.min(size,base+chunkSize*4);offset+=chunkSize){
      const length=Math.min(chunkSize,size-offset);
      jobs.push((async()=>{
        const chunk=modelChunk(await read({offset,length}));
        if(chunk.length!==length)throw Error('Truncated saved model payload');
        bytes.set(chunk,offset);completed+=length;
      })());
    }
    await Promise.all(jobs);progress(Math.round(completed*100/size));
  }
  return bytes;
}
