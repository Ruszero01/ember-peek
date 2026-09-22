import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

async function sdkPage(label) {
 const browserListeners=new Map();
 const pageListeners=new Map();
 const parentWindow={};
 globalThis.parent=parentWindow;
 globalThis.window={addEventListener:(type,listener)=>browserListeners.set(type,listener)};
 globalThis.addEventListener=(type,listener)=>pageListeners.set(type,listener);
 globalThis.location={origin:'http://plugin.localhost'};
 globalThis.document={
  documentElement:{lang:'',style:{setProperty(){},colorScheme:''}},
 };
 const sdk=await import(`../sdk/web/index.js?${label}=${Date.now()}-${Math.random()}`);
 return {sdk,browserListeners,parentWindow};
}

test('file and related-resource helpers use the initialized session safely',async()=>{
 const {sdk,browserListeners,parentWindow}=await sdkPage('file-resources');
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
 const related=sdk.resourceUrl('../assets/cover image.png');
 assert.equal(related,'http://plugin.localhost/test/@resource/..%2Fassets%2Fcover%20image.png');
 const remote=sdk.resourceUrl('https://cdn.example.test/a%20b.png?size=2');
 assert.match(remote,/https%3A%2F%2Fcdn\.example\.test%2Fa%2520b\.png%3Fsize%3D2$/);
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async url=>{
  assert.equal(url,related);
  return new Response(Uint8Array.from([1,2,3]),{headers:{'Content-Type':'image/png'}});
 };
 const resource=await sdk.resourceBlob('../assets/cover image.png');
 assert.equal(resource.type,'image/png');
 assert.deepEqual(Buffer.from(await resource.arrayBuffer()),Buffer.from([1,2,3]));
 globalThis.fetch=originalFetch;
 port1.close();port2.close();
});

test('replacing a view channel rejects work left on the old port',async()=>{
 const {sdk,browserListeners,parentWindow}=await sdkPage('reconnect');
 const first=new MessageChannel();
 first.port1.onmessage=event=>{
  if(event.data.type==='connected')
   first.port1.postMessage({type:'init',session:'first',file:{name:'a.txt',size:1},theme:{},locale:'en',settings:{}});
 };
 first.port1.start();
 browserListeners.get('message')({source:parentWindow,data:{type:'ember:connect'},ports:[first.port2]});
 await sdk.ready;
 const stranded=sdk.call('never-answers');
 const second=new MessageChannel();
 second.port1.onmessage=()=>{};
 second.port1.start();
 browserListeners.get('message')({source:parentWindow,data:{type:'ember:connect'},ports:[second.port2]});
 await assert.rejects(stranded,/connection was replaced/i);
 first.port1.close();first.port2.close();second.port1.close();second.port2.close();
});
