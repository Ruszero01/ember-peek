import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The bundled Pi loop is what the host runs, so every case builds it the same way. */
let bundled;
async function bundle(){
 if(bundled)return bundled;
 const directory=await mkdtemp(path.join(tmpdir(),'ember-pi-test-'));
 const runner=path.join(directory,'agent.mjs');
 await build({entryPoints:[fileURLToPath(new URL('../plugins/workshop/agent/runner.mjs',import.meta.url))],bundle:true,platform:'node',format:'esm',target:'node22',outfile:runner,banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"}});
 bundled={directory,runner};
 return bundled;
}

/** The shortest script that reaches a finished run: write the three files, then validate. */
const PREVIEW_PASSED={value:{ok:true,logs:[],probes:1,probeLimit:4}};
/** What the host answers with when the case does not script its own reply. */
function defaultReply(event){
 if(event.method==='preview')return PREVIEW_PASSED;
 if(event.method==='icons')return {value:['box','file-text']};
 return {ok:true};
}
/** The shortest script that reaches a finished run: write the three files, validate them,
 *  then let the host run the plugin and see it work. */
function finished(){
 return [
  ['write_file',{path:'metadata.json',content:'{"name":"Test","summary":"preview","extension":"xyz","icon":"file"}'}],
  ['write_file',{path:'ui/view.js',content:'import {ready,presented} from "./sdk.js"; await ready; await presented();'}],
  ['write_file',{path:'ui/style.css',content:''}],
  ['validate',{}],
  ['preview',{}],
 ];
}

/**
 * Run the loop against a mock provider that replays `script`, one tool call per request.
 * Returns what the model was sent and what the loop emitted.
 */
async function replay({script,init={},reply,usageTokens=0}){
 const {runner}=await bundle();
 let count=0;let rateLimited=false;const requests=[];
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);requests.push(body);
  assert.equal(req.headers.authorization,undefined);assert.equal(body.stream,true);assert.equal(body.max_tokens,undefined);
  if(count===2&&!rateLimited){rateLimited=true;res.writeHead(429,{'Content-Type':'application/json','Retry-After':'1'});res.end(JSON.stringify({error:{message:'Upstream temporarily unavailable',type:'rate_limit_error'}}));return;}
  const call=(name,args)=>({index:0,id:`call_${count}`,type:'function',function:{name,arguments:JSON.stringify(args)}});
  const [name,args]=script[count++];
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const chunk=(delta,finish_reason=null)=>`data: ${JSON.stringify({id:'test',object:'chat.completion.chunk',created:1,model:'test',choices:[{index:0,delta,finish_reason}]})}\n\n`;
  res.write(chunk({role:'assistant',content:'Working. '}));res.write(chunk({tool_calls:[call(name,args)]}));res.write(chunk({},'tool_calls'));
  if(usageTokens)res.write(`data: ${JSON.stringify({id:'test',object:'chat.completion.chunk',created:1,model:'test',choices:[],usage:{prompt_tokens:usageTokens,completion_tokens:0,total_tokens:usageTokens}})}\n\n`);
  res.end('data: [DONE]\n\n');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const child=spawn(process.execPath,[runner],{stdio:['pipe','pipe','pipe']});
 const events=[];let stderr='';child.stderr.on('data',data=>stderr+=data);
 const lines=createInterface({input:child.stdout});let validation=0;
 lines.on('line',line=>{const event=JSON.parse(line);events.push(event);if(event.type==='request')child.stdin.write(JSON.stringify({type:'reply',id:event.id,...(reply?reply(++validation,event):defaultReply(event))})+'\n');});
 child.stdin.write(JSON.stringify({type:'start',model:'test',endpoint:`http://127.0.0.1:${server.address().port}/v1`,key:'',instructions:'test',context:{},...init})+'\n');
 const timer=setTimeout(()=>child.kill(),15000);
 const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timer);server.close();
 return {code,events,requests,stderr,calls:count};
}

test('bundled Pi loop streams tools, saves files, and repairs host validation errors',async()=>{
 const {code,events,requests,stderr,calls}=await replay({
  script:[
   ['write_file',{path:'metadata.json',content:'{"name":"Test","summary":"preview","extension":"html","icon":"file"}'}],
   ['write_file',{path:'ui/view.js',content:'first'}],
   ['write_file',{path:'ui/style.css',content:''}],
   ['validate',{}],
   ['edit_file',{path:'ui/view.js',oldText:'first',newText:'fixed'}],
   ['validate',{}],
   ['preview',{}],
  ],
  reply:(turn,event)=>event.method==='preview'?PREVIEW_PASSED:(turn>1?{ok:true}:{ok:false,error:'Fix first'}),
 });
 assert.equal(code,0,stderr+JSON.stringify(events));assert.equal(calls,7);assert.equal(events.at(-1).type,'done');
 assert(events.some(e=>e.type==='output'&&e.text.includes('Working')));
 assert(events.some(e=>e.type==='file'&&e.content==='fixed'));
 assert.equal(requests[0].tools.length,11);
 assert.equal(requests[0].tools.some(tool=>tool.function.name==='preview'),true);
 assert.equal(requests[0].tools.some(tool=>tool.function.name==='read_attachment'),true);
 assert.equal(requests.length,8);assert.deepEqual(requests[2],requests[3]);
 assert(events.some(e=>e.type==='activity'&&e.message.includes('429')));
 // Every tool call becomes one step of the turn, with what it touched and what came back.
 const steps=events.filter(e=>e.type==='activity'&&e.tool);
 assert.equal(steps.map(step=>step.tool).join(','),'write_file,write_file,write_file,validate,edit_file,validate,preview');
 assert.equal(steps[1].path,'ui/view.js');
 assert.equal(steps[1].detail,'5 bytes');
 assert.equal(steps.at(-1).detail.includes('自检'),true);
 assert(events.filter(e=>e.type==='output').every(e=>!e.text.includes('write_file')));
});

test('a library the model pulls is fetched, and its bytes are never faked back to the model',async()=>{
 // The workshop is the fallback for formats no first-party plugin covers, so the loop has to
 // be able to take a library it did not ship: ask what a package holds, then take one file.
 const {code,events,requests,calls,stderr}=await replay({
  script:[
   ['add_dependency',{package:'mp4box'}],
   ['add_dependency',{package:'mp4box',version:'0.5.4',files:['dist/mp4box.all.js']}],
   ['read_file',{path:'ui/vendor/mp4box.all.js'}],
   ['write_file',{path:'metadata.json',content:'{"name":"Video","summary":"preview","extension":"mp4","icon":"film"}'}],
   ['write_file',{path:'ui/view.js',content:'import "./vendor/mp4box.all.js";\nimport {ready,presented} from "./sdk.js";\nawait ready;\nawait presented();'}],
   ['write_file',{path:'ui/style.css',content:''}],
   ['validate',{}],
   ['preview',{}],
  ],
  reply:(turn,event)=>{
   if(event.method==='dependency'){
    return turn===1
     ?{value:{package:'mp4box',version:'0.5.4',integrity:'sha512-x',entry:'dist/mp4box.all.js',licence:'LICENSE',total:42,notes:[],files:[{path:'dist/mp4box.all.js',bytes:162805},{path:'src/isofile.js',bytes:22485}]}}
     :{value:{package:'mp4box',version:'0.5.4',integrity:'sha512-x',licence:'mp4box-LICENSE.txt',files:[{path:'dist/mp4box.all.js',name:'mp4box.all.js',bytes:162805}],notes:['mp4box.all.js 没有 export：它是脚本构建（UMD/IIFE），用 import 触发副作用，再从全局 MP4Box 读它的接口']}};
   }
   if(event.method==='preview')return PREVIEW_PASSED;
   if(event.method==='icons')return {value:['film']};
   return {ok:true};
  },
 });
 assert.equal(code,0,stderr+JSON.stringify(events));
 const steps=events.filter(e=>e.type==='activity'&&e.tool);
 assert.equal(steps[0].tool,'add_dependency');
 assert.equal(steps[0].detail,'mp4box@0.5.4 · 共 42 个文件');
 assert.equal(steps[1].detail,'mp4box@0.5.4 · mp4box.all.js');
 // The host wrote those bytes into the package; the model is told that instead of being handed
 // an empty file it might mistake for the whole library.
 const read=requests.flatMap(request=>request.messages).find(message=>typeof message.content==='string'&&message.content.includes('宿主从取库源直接写入包内'));
 assert.notEqual(read,undefined,'a vendored file must not read back as empty');
 // And what the host said about the build reaches the model, which is how it learns to read a
 // UMD build's global instead of its (nonexistent) exports.
 const note=requests.flatMap(request=>request.messages).find(message=>typeof message.content==='string'&&message.content.includes('MP4Box'));
 assert.notEqual(note,undefined,'the host note about the build has to reach the model');
});

test('a page that failed is not requested from the host twice',async()=>{
 const url='https://docs.example.test/missing';
 const {code,events,stderr}=await replay({
  script:[['read_page',{url}],['read_page',{url}],...finished()],
  reply:(_,event)=>event.method==='page'
   ?{ok:false,error:'目标站点返回 404；请换用其他公开来源'}
   :event.method==='preview'?PREVIEW_PASSED:{ok:true},
 });
 assert.equal(code,0,stderr+JSON.stringify(events));
 assert.equal(events.filter(event=>event.type==='request'&&event.method==='page').length,1);
 const pageSteps=events.filter(event=>event.type==='activity'&&event.tool==='read_page');
 assert.equal(pageSteps.length,2);
 assert(pageSteps.every(step=>step.detail==='失败'));
});

test('the host-owned SDK is readable through every path the model naturally tries',async()=>{
 const sdkSource='export const marker = "exact-host-sdk";';
 const {code,events,requests,stderr}=await replay({
  script:[
   ['read_file',{path:'ui/sdk.js'}],
   ['read_file',{path:'sdk.js'}],
   ['read_file',{path:'./sdk.js'}],
   ...finished(),
  ],
  init:{sdkSource},
 });
 assert.equal(code,0,stderr+JSON.stringify(events));
 const seen=requests.flatMap(request=>request.messages).filter(message=>typeof message.content==='string'&&message.content.includes('exact-host-sdk'));
 assert.equal(seen.length>=3,true,'each SDK alias must return the exact host source');
 assert.equal(events.filter(event=>event.type==='activity'&&event.tool==='read_file'&&event.detail===`${sdkSource.length} 字符`).length,3);
});

test('a failed self-check hands the page diagnostics and the screenshot to the model',async()=>{
 const shot='iVBORw0KGgoAAAANSUhEUg==';let previews=0;
 const {code,events,requests}=await replay({
  script:[
   ...finished().slice(0,4),
   ['preview',{}],
   ['edit_file',{path:'ui/view.js',oldText:'await presented();',newText:'await presented(); // fixed'}],
   ['validate',{}],
   ['preview',{}],
  ],
  reply:(turn,event)=>{
   if(event.method!=='preview')return turn>1?{ok:true}:{ok:false,error:'Fix first'};
   previews++;
   // The first run renders nothing and throws; the fix works.
   return previews===1
    ?{value:{ok:false,error:'页面在渲染时抛出异常',logs:['error: Cannot read properties of null'],image:shot,probes:1,probeLimit:4}}
    :{value:{ok:true,logs:[],image:shot,probes:2,probeLimit:4}};
  },
 });
 assert.equal(code,0,JSON.stringify(events));
 assert.equal(previews,2);
 const page=requests.flatMap(request=>request.messages).find(message=>typeof message.content==='string'&&message.content.includes('页面在渲染时抛出异常'));
 assert.notEqual(page,undefined,'the verdict has to reach the model');
 assert.match(page.content,/Cannot read properties of null/);
 assert.match(page.content,/"of":4/);
 // A failed run is exactly when the picture matters, so it rides along with the result.
 const image=requests.flatMap(request=>request.messages).flatMap(message=>Array.isArray(message.content)?message.content:[]).find(part=>part.type==='image_url');
 assert.equal(image.image_url.url,`data:image/png;base64,${shot}`);
});

test('a run that never self-checks stops instead of asking forever',async()=>{
 // A task with no sample cannot be run, so the loop has to finish rather than wait.
 const reads=[['read_file',{path:'sdk.md'}],['read_file',{path:'sdk.md'}],['read_file',{path:'sdk.md'}]];
 const {code,events,requests}=await replay({
  script:finished().slice(0,4).concat(reads),
  reply:(_,event)=>event.method==='preview'?PREVIEW_PASSED:{ok:true},
 });
 assert.equal(code,0,JSON.stringify(events));
 assert.equal(events.at(-1).type,'done');
 assert.equal(requests.length,7);
 assert(events.some(e=>e.type==='activity'&&e.message.includes('没有试运行')),JSON.stringify(events.filter(e=>e.type==='activity')));
});

test('a failed self-check stops after three turns without a repair',async()=>{
 const reads=[['read_file',{path:'sdk.md'}],['read_file',{path:'sdk.md'}],['read_file',{path:'sdk.md'}]];
 const {code,events,requests,calls,stderr}=await replay({
  script:finished().slice(0,4).concat([['preview',{}]],reads),
  reply:(_,event)=>event.method==='preview'
   ?{value:{ok:false,error:'MEDIA_ERR_SRC_NOT_SUPPORTED',logs:[],probes:1,probeLimit:4}}
   :{ok:true},
 });
 assert.equal(code,0,stderr+JSON.stringify(events));
 assert.equal(events.at(-1).type,'done');
 assert.equal(calls,8);
 assert.equal(requests.length,9); // one provider request is retried after the scripted 429
 assert(events.some(e=>e.type==='activity'&&e.message.includes('连续 3 轮没有修改')),JSON.stringify(events.filter(e=>e.type==='activity')));
});

test('the advertised preview budget is a terminal limit, without a fifth request',async()=>{
 const previews=[['preview',{}],['preview',{}],['preview',{}],['preview',{}]];
 let probe=0;
 const {code,events,requests,calls,stderr}=await replay({
  script:finished().slice(0,4).concat(previews),
  init:{probeLimit:4},
  reply:(_,event)=>event.method==='preview'
   ?{value:{ok:false,error:'still broken',logs:[],probes:++probe,probeLimit:4}}
   :{ok:true},
 });
 assert.equal(code,0,stderr+JSON.stringify(events));
 assert.equal(events.at(-1).type,'done');
 assert.equal(calls,8);
 assert.equal(requests.length,9); // four previews, never a fifth; plus the scripted 429 retry
 assert(events.some(e=>e.type==='activity'&&e.message.includes('4 次上限')),JSON.stringify(events.filter(e=>e.type==='activity')));
});

test('cumulative token usage does not stop an unvalidated build',async()=>{
 const {code,events,calls,stderr}=await replay({
  script:[
   ['read_file',{path:'sdk.md'}],
   ...finished(),
  ],
  init:{},
  usageTokens:100000,
  reply:(_,event)=>event.method==='preview'?PREVIEW_PASSED:{ok:true},
 });
 assert.equal(code,0,stderr+JSON.stringify(events));
 assert.equal(calls,6);
 assert.equal(events.at(-1).type,'done');
});

test('a file the agent brings along is written and imported',async()=>{
 const {code,events}=await replay({
  script:[
   ['write_file',{path:'metadata.json',content:'{"name":"Test","summary":"preview","extension":"xyz","icon":"file"}'}],
   // A small library the agent wrote itself, imported by the view that follows.
   ['write_file',{path:'ui/vendor/tiny.js',content:'export const parse = bytes => bytes.length;\n'}],
   ['write_file',{path:'ui/view.js',content:'import {ready,presented} from "./sdk.js";\nimport {parse} from "./vendor/tiny.js";\nawait ready;\nparse(new Uint8Array());\nawait presented();\n'}],
   ['write_file',{path:'ui/style.css',content:''}],
   ['validate',{}],
   ['preview',{}],
  ],
  reply:(_,event)=>event.method==='preview'?PREVIEW_PASSED:{ok:true},
 });
 assert.equal(code,0,JSON.stringify(events));
 const written=events.filter(e=>e.type==='file').map(e=>e.path);
 assert.deepEqual(written,['metadata.json','ui/vendor/tiny.js','ui/view.js','ui/style.css']);
});

test('the request carries requirements, host facts, captured frame and added reference images',async()=>{
 const image={name:'shot-1.png',data:'iVBORw0KGgoAAAANSUhEUg=='};
 const reference='iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
 const {code,events,requests}=await replay({
  script:finished(),
  init:{image,context:{requirements:['把 .xyz 渲染成三维预览','加上线框切换'],sample:{name:'model.xyz',extension:'xyz',size:12},attachments:[{id:'attachment-1',name:'参考.png',size:28,image:true,mime:'image/png'}],plan:null,previousDiagnostics:'上一次自检：页面抛了异常'}},
  reply:(_,event)=>event.method==='attachment'?{value:{name:'参考.png',encoding:'base64',data:reference,mime:'image/png'}}:event.method==='preview'?PREVIEW_PASSED:{ok:true},
 });
 assert.equal(code,0,JSON.stringify(events));
 const content=requests[0].messages.find(message=>message.role==='user').content;
 assert.equal(Array.isArray(content),true);
 // The user's own words are the request; the host's facts follow as machine-readable data.
 assert.match(content[0].text,/需求 1：把 \.xyz 渲染成三维预览/);
 assert.match(content[0].text,/需求 2：加上线框切换/);
 assert.match(content[0].text,/"extension":"xyz"/);
 assert.match(content[0].text,/"name":"参考.png"/);
 assert.match(content[0].text,/上一次自检/);
 assert.deepEqual(content[1],{type:'image_url',image_url:{url:`data:image/png;base64,${image.data}`}});
 assert.deepEqual(content[2],{type:'image_url',image_url:{url:`data:image/png;base64,${reference}`}});
});

test('a request without a captured frame stays plain text',async()=>{
 const {code,events,requests}=await replay({script:finished(),init:{context:{requirements:['做一个纯文本预览'],sample:null}}});
 assert.equal(code,0,JSON.stringify(events));
 const content=requests[0].messages.find(message=>message.role==='user').content;
 // Without a capture the request is text only: one part, no image.
 assert.equal(content.length,1);
 assert.equal(content[0].type,'text');
 assert.match(content[0].text,/需求 1：做一个纯文本预览/);
 assert.match(content[0].text,/"sample":null/);
});
