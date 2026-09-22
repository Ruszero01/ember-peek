import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

test('fileBlob recovers the initialized sample size when an older viewer omits it',async()=>{
 const browserListeners=new Map();
 const pageListeners=new Map();
 const parentWindow={};
 globalThis.parent=parentWindow;
 globalThis.window={addEventListener:(type,listener)=>browserListeners.set(type,listener)};
 globalThis.addEventListener=(type,listener)=>pageListeners.set(type,listener);
 globalThis.document={
  documentElement:{lang:'',style:{setProperty(){},colorScheme:''}},
 };
 const sdk=await import(`../sdk/web/index.js?file-blob-default=${Date.now()}`);
 const {port1,port2}=new MessageChannel();
 const bytes=Buffer.from([0x00,0x01,0x02,0x03]);
 port1.onmessage=event=>{
  const message=event.data;
  if(message.type==='connected'){
   port1.postMessage({type:'init',session:'test',file:{name:'sample.bin',size:bytes.length},theme:{},locale:'en',settings:{}});
  }else if(message.type==='request'&&message.method==='read'){
   const {offset,length}=message.params;
   port1.postMessage({type:'reply',id:message.id,value:bytes.subarray(offset,offset+length).toString('base64')});
  }
 };
 port1.start();
 browserListeners.get('message')({source:parentWindow,data:{type:'ember:connect'},ports:[port2]});
 await sdk.ready;
 const blob=await sdk.fileBlob();
 assert.equal(blob.size,bytes.length);
 assert.equal(blob.type,'');
 assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);
 port1.close();port2.close();
});

