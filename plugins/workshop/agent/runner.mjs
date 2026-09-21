import { Agent } from '@earendil-works/pi-agent-core';
import { streamSimple } from '@earendil-works/pi-ai/api/openai-completions';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';

const lines=createInterface({input:process.stdin});
const pending=new Map();let start;let serial=0;
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const input=new Promise(resolve=>{start=resolve;});
lines.on('line',line=>{const value=JSON.parse(line);if(value.type==='start')start(value);else if(value.type==='reply'){pending.get(value.id)?.(value);pending.delete(value.id);}});
const request=(method,args)=>new Promise(resolve=>{const id=++serial;pending.set(id,resolve);emit({type:'request',id,method,args});});
const schema=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string={type:'string'};
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],details:{value}});
// A one-line result for the turn's own record: enough to tell a reader what came back.
const summary=(tool,reply,isError)=>{
 if(isError)return '失败';
 const value=reply?.details?.value||reply;
 if(tool==='write_file'||tool==='edit_file')return typeof value?.bytes==='number'?`${value.bytes} bytes`:'已保存';
 if(tool==='validate')return value?.ok===true?'通过':(value?.error||'未通过');
 if(tool==='preview'){
  if(value?.limited)return '自检次数已用完';
  const run=value?.probes?`第 ${value.probes} 次自检`:'自检';
  return value?.ok===true?`${run} · 通过`:(value?.error?`${run} · 未通过`:`${run} · 未运行`);
 }
 if(tool==='list_icons')return Array.isArray(value?.icons)?`${value.icons.length} 个名称`:'';
 if(tool==='read_file')return typeof value?.content==='string'?`${value.content.length} 字符`:'';
 if(tool==='add_dependency'){
  // A listing answers with paths; a fetch answers with the names it landed.
  if(Array.isArray(value?.files)&&value.files.every(file=>typeof file?.name==='string'))return `${value.package}@${value.version} · ${value.files.map(file=>file.name).join(' ')}`;
  return typeof value?.total==='number'?`${value.package}@${value.version} · 共 ${value.total} 个文件`:'';
 }
 if(tool==='search_web')return Array.isArray(value?.results)?`${value.results.length} 条结果`:'';
 if(tool==='read_docs')return typeof value?.text==='string'?`${value.id||value.library} · ${value.text.length} 字符`:'';
 if(tool==='read_page')return typeof value?.text==='string'?`${value.text.length} 字符`:'';
 return '';
};
try{
 const init=await input;
 const files={...(init.files||{})};
 // What the agent may write: its own record, the page under ui/, and anything it brings
 // along under vendor/. The host refuses the rest, so this is a guard rail, not the rule.
 const hostFiles=['index.html','sdk.js','sdk-ui.css'];
 const leaf=part=>/^[A-Za-z0-9._-]{1,64}$/.test(part)&&!part.startsWith('.');
 // The page lives under ui/, so anything it imports lives there too.
 const writable=path=>{
  if(path==='metadata.json')return true;
  if(!path.startsWith('ui/'))return false;
  const parts=path.slice(3).split('/');
  if(parts.length===1)return leaf(parts[0])&&!hostFiles.includes(parts[0]);
  return parts.length===2&&parts[0]==='vendor'&&leaf(parts[1]);
 };
 const filePath={type:'string',description:'Path inside the package: metadata.json, ui/<name> or ui/vendor/<name>.'};
 // Files the host pulled from a registry: they are in the package, but their bytes are not
 // part of this conversation.
 const vendored=new Set();
 let validated=false;let previewOk=false;let previews=0;let exhausted=false;let idle=0;
 const tools=[
  {name:'read_file',label:'读取文件',description:'Read a file in the package or the SDK reference.',parameters:schema({path:{type:'string',description:'metadata.json, ui/<name>, vendor/<name> or sdk.md.'}}),execute:async(_,args)=>{
   if(args.path==='sdk.md')return result({content:init.instructions});
   if(!writable(args.path))throw Error('只能读 metadata.json、ui/ 下的文件（或 sdk.md）');
   if(vendored.has(args.path))return result({content:'这个文件是宿主从取库源直接写入包内的，字节不经过这里。要知道它导出什么，就在页面里 import 它并从试运行的结果看，或查它自己的文档。'});
   return result({content:files[args.path]||''});
  }},
  {name:'list_icons',label:'查询图标',description:'List canonical Lucide icon names, optionally filtered by a query. Every control icon has to be one of these names.',parameters:schema({query:string}),execute:async(_,args)=>{const reply=await request('icons',{query:String(args.query||'')});return result({icons:reply.value||[]});}},
  // The format decides the library, and only the model knows which one it needs. The host
  // fetches it: pinned to a version, checked against the hash the registry published,
  // unpacked without running anything, and copied into ui/vendor/ as a file the page imports.
  {name:'add_dependency',label:'取用库',description:'Fetch a library from the npm registry into ui/vendor/, then import it from the page by relative path. Call it with only `package` first to see what the package holds and which entry point it declares; call it again with `files` to vendor the exact files you want. Pick one bundled build (a dist/ or build/ file): a file that still imports other packages by name, or a package whose build needs a bundler, cannot be loaded by the page and the host refuses it with what to do instead. The package, its exact version, its integrity hash and its licence text are recorded in dependencies.json, which travels with the plugin.',parameters:{type:'object',properties:{package:{type:'string',description:'npm package name, for example mp4box or @scope/name.'},version:{type:'string',description:'Exact version such as 0.5.4. Leave it out for the latest.'},files:{type:'array',items:{type:'string'},description:'Files inside the package to vendor, for example dist/mp4box.all.js. Each one lands in ui/vendor/ under its own file name.'}},required:['package'],additionalProperties:false},execute:async(_,args)=>{   const reply=await request('dependency',{package:String(args.package||''),version:args.version?String(args.version):undefined,files:Array.isArray(args.files)?args.files.map(String):[]});
   if(reply.ok===false)throw Error(reply.error||'取库失败');
   const value=reply.value||{};
   // The host wrote the bytes into the package itself; this only records that the file is
   // there, so validate resolves the import that names it.
   for(const file of value.files||[])vendored.add(`ui/vendor/${file.name}`);
   if(value.files?.length)validated=false;
   return result(value);
  }},
  // Looking things up. The formats nobody wrote a plugin for are exactly the ones the model
  // does not already know: which library reads the container, what its API is, why a decoder
  // refuses a stream. All three go through the host, are capped per run, and come back as
  // material to reason about — never as something to obey.
  {name:'search_web',label:'联网搜索',description:'Search for a library, an API or a question someone already asked. Answers from npm packages, library documentation and Stack Overflow, plus the open web when a search engine is configured in the workshop settings. Use it when the format or the container is one you do not know: before writing a parser from scratch, check whether a library already reads it, then pull that library with add_dependency or read its docs.',parameters:schema({query:string}),execute:async(_,args)=>{const reply=await request('search',{query:String(args.query||'')});if(reply.ok===false)throw Error(reply.error||'搜索失败');const value=reply.value||{};return result({results:value.results||[],notes:value.notes||[]});}},
  {name:'read_docs',label:'查文档',description:'Read a library\'s documentation by name, optionally narrowed to a topic. This is the fastest way to learn a library\'s real API before using it: name the package, ask for the topic you need, and write the page against what it actually exposes instead of guessing. Follow up with another topic if the part you need is not in the answer.',parameters:{type:'object',properties:{library:{type:'string',description:'Library name such as mp4box or pdfjs-dist, or a context7 id such as /gpac/mp4box.js.'},topic:{type:'string',description:'What you need from the documentation, for example "MediaSource" or "reacting to partial input". Optional.'}},required:['library'],additionalProperties:false},execute:async(_,args)=>{const reply=await request('docs',{library:String(args.library||''),topic:args.topic?String(args.topic):undefined});if(reply.ok===false)throw Error(reply.error||'取文档失败');const value=reply.value||{};return result(value);}},
  {name:'read_page',label:'读取网页',description:'Read one public web page as text: the documentation site a search pointed at, a specification, a changelog, a README. Use it to confirm a fact you are about to build on — a container layout, a codec requirement, an API signature — instead of relying on memory. Local and private addresses are refused.',parameters:{type:'object',properties:{url:{type:'string',description:'Public http/https URL.'}},required:['url'],additionalProperties:false},execute:async(_,args)=>{const reply=await request('page',{url:String(args.url||'')});if(reply.ok===false)throw Error(reply.error||'读取失败');const value=reply.value||{};return result(value);}},
  {name:'write_file',label:'写入文件',description:'Write one file of the plugin: metadata.json (name, summary, extension, icon), a file of the page under ui/, or a library you bring under ui/vendor/. Call validate before finishing.',parameters:schema({path:filePath,content:string}),execute:async(_,args)=>{
   if(!writable(args.path))throw Error('只能写 metadata.json、ui/<文件名> 或 ui/vendor/<文件名>');
   if(Buffer.byteLength(args.content)>160000)throw Error('File exceeds 160 KiB');
   files[args.path]=args.content;validated=false;emptyTruncations=0;emit({type:'file',path:args.path,content:args.content});return result({saved:args.path,bytes:Buffer.byteLength(args.content)});
  }},
  {name:'edit_file',label:'修改文件',description:'Replace one exact, unique text occurrence in a file of the plugin.',parameters:schema({path:filePath,oldText:string,newText:string}),execute:async(_,args)=>{
   const text=files[args.path];if(!writable(args.path)||!args.oldText||typeof text!=='string'||text.split(args.oldText).length!==2)throw Error('Text must occur exactly once');
   const changed=text.replace(args.oldText,args.newText);if(Buffer.byteLength(changed)>160000)throw Error('File exceeds 160 KiB');files[args.path]=changed;validated=false;emptyTruncations=0;emit({type:'file',path:args.path,content:changed});return result({saved:args.path});
  }},
  {name:'validate',label:'校验插件',description:'Validate generated files with the host SDK rules. Fix diagnostics using edit_file before validating again.',parameters:schema({}),execute:async()=>{
   let metadata;try{metadata=JSON.parse(files['metadata.json']||'');}catch{throw Error('Write valid metadata.json first');}
   const reply=await request('validate',{...metadata,javascript:files['ui/view.js']||'',css:files['ui/style.css']||''});validated=reply.ok===true;return result(reply);
  }},
  // The host runs the plugin for real and answers with what the page reported: its own
  // verdict, its uncaught errors and console failures, and a picture of what it drew.
  // This is the agent's feedback loop, so a broken render is something to fix here rather
  // than a message for the user to relay.
  {name:'preview',label:'试运行插件',description:'Build the plugin and run it against the sample file in the host preview window. Returns the verdict the page reported, the errors and console failures it logged, and a screenshot of what it rendered. Call it after validate, fix what it reports, and call it again until it passes or the run budget is used up.',parameters:{type:'object',properties:{screenshot:{type:'boolean',description:'Also attach the screenshot when the run passed. A failed run always attaches one.'}},required:[],additionalProperties:false},execute:async(_,args)=>{
   const reply=await request('preview',{});const value=reply?.value||{};
   previews=typeof value.probes==='number'?value.probes:previews+1;
   previewOk=value.ok===true;
   if(value.limited)exhausted=true;
   const parts=[{type:'text',text:JSON.stringify({ok:value.ok===true,limited:!!value.limited,error:value.error??null,pageDiagnostics:value.logs||[],note:value.note??null,run:previews,of:value.probeLimit??null})}];
   const wanted=args.screenshot===true||(args.screenshot!==false&&value.ok!==true);
   if(wanted&&value.image)parts.push({type:'image',data:value.image,mimeType:'image/png'});
   // `details` carries the verdict to the step summary above, not to the model.
   return {content:parts,details:{value}};
  }}
 ];
 const model={id:init.model,name:init.model,api:'openai-completions',provider:'workshop',baseUrl:init.endpoint.replace(/\/chat\/completions\/?$/,''),reasoning:false,input:['text','image'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:init.contextWindow||131072,maxTokens:init.maxTokens||32768,compat:{supportsDeveloperRole:false,supportsStore:false,supportsReasoningEffort:false,supportsUsageInStreaming:true,maxTokensField:'max_tokens'}};
 const agent=new Agent({initialState:{model,thinkingLevel:'off',systemPrompt:init.analysis?init.instructions:`${init.instructions}\n\nUse tools to develop this plugin. Do not output a JSON code block. Read sdk.md for the SDK contract. Write metadata.json, ui/view.js and ui/style.css separately, then call validate. Fix validation errors. When validated successfully, finish with a brief summary.`,tools:init.analysis?[]:tools},streamFn:(model,context,options)=>streamSimple(model,context,{...options,apiKey:init.key||'local-no-auth',timeoutMs:(init.timeoutSeconds||300)*1000,maxRetries:0,fetch:async(url,options)=>{
   const headers=new Headers(options?.headers);if(!init.key)headers.delete('authorization');
   for(let attempt=0;;attempt++){
    const response=await fetch(url,{...options,headers,redirect:'error'});
    if(![429,502,503,504].includes(response.status)||attempt>=3)return response;
    const retry=response.headers.get('retry-after');
    const seconds=retry?(Number(retry)||Math.ceil((Date.parse(retry)-Date.now())/1000)):2**(attempt+1);
    if(seconds>60)return response;
    const wait=Math.max(1,Number.isFinite(seconds)?seconds:2**(attempt+1));
    emit({type:'activity',message:`服务暂时繁忙（${response.status}），${wait} 秒后重试 · ${attempt+1}/3`});
    await response.body?.cancel();await delay(wait*1000,undefined,{signal:options?.signal});
   }
  },temperature:init.temperature??undefined,onPayload:payload=>{delete payload.max_tokens;delete payload.max_completion_tokens;}}),// Validating proves the files parse; only a real run proves they render. The stop check
// decides how long the loop waits for that run: a turn to ask for one after a pass, turns
// to fix a failed one, and a hard stop once the host refuses to run it again. `validate`
// answers with `next` for the same reason — the step after a pass is to run the thing.
shouldStopAfterTurn:()=>{
  if(!validated)return false;
  if(previewOk)return true;
  if(exhausted)return true;
  if(previews===0)return ++idle>2;
  return false;
},toolExecution:'sequential'});
 let text='';let chunk='';let last=0;let usage=0;let emptyTruncations=0;const calls=new Map();
 // `text` is everything this run said, `chunk` is the message being written now. The host
 // puts the chunk in the step that is open and keeps the whole thing as the turn's text, so
 // nothing is repeated and no separator has to be invented between messages.
 const flush=()=>{emit({type:'output',text:chunk,whole:text});last=Date.now();};
 agent.subscribe(event=>{
  if(event.type==='message_start'&&event.message.role==='assistant')chunk='';
  if(event.type==='message_update'&&event.assistantMessageEvent.type==='text_delta'){text+=event.assistantMessageEvent.delta;chunk+=event.assistantMessageEvent.delta;text=text.slice(-64000);chunk=chunk.slice(-64000);if(Date.now()-last>200)flush();}
  // Each tool call becomes one step of the turn: what it was, what it touched and what it
  // came back with, the way a coding agent shows its work next to what it said.
  const verbs={read_file:'读取',list_icons:'查询图标',add_dependency:'取用库',search_web:'联网搜索',read_docs:'查文档',read_page:'读取网页',write_file:'写入',edit_file:'修改',validate:'校验',preview:'试运行'};
  if(event.type==='tool_execution_start')calls.set(event.toolCallId,event.args||{});
  if(event.type==='tool_execution_end'){
   const args=calls.get(event.toolCallId)||{};calls.delete(event.toolCallId);
   const path=typeof args.path==='string'?args.path:'';
   const value=summary(event.toolName,event.result,event.isError);
   const label=verbs[event.toolName]||event.toolName;
   emit({type:'activity',tool:event.toolName,path,detail:value,message:`${label}${path?' · '+path:''}${value?' · '+value:''}`});
  }
  if(event.type==='message_end'&&event.message.role==='assistant'){
   usage+=event.message.usage?.totalTokens||0;flush();emit({type:'usage',total_tokens:usage});
   if(event.message.stopReason==='error'||event.message.stopReason==='aborted')throw Error(event.message.errorMessage||'Model request failed');
   if(event.message.stopReason==='length'&&++emptyTruncations>3)throw Error('供应商连续截断响应，已保存文件；请更换支持长输出的模型继续。');
   if(event.message.stopReason==='length')agent.followUp({role:'user',content:[{type:'text',text:'The response was truncated. Preserve saved files, write smaller chunks using edit_file, and continue until validate succeeds.'}],timestamp:Date.now()});
  }
 });
 // The user's own words are the request; the machine-readable block is the host's facts
 // about it. Keeping them apart stops host details from reading as requirements.
 const requirements=(init.context?.requirements||[]).map(text=>String(text||'').trim()).filter(Boolean);
 const brief=JSON.stringify({sample:init.context?.sample||null,existingFiles:Object.keys(files),plan:init.context?.plan||null,previousDiagnostics:init.context?.previousDiagnostics||null});
 const asked=requirements.length?requirements.map((text,index)=>`需求 ${index+1}：${text}`).join('\n'):'用户只提供了样例文件，没有填写文字需求。';
 // A captured trial-preview frame rides along with the request that follows it.
 const images=init.image?.data?[{type:'image',data:init.image.data,mimeType:'image/png'}]:[];
 await agent.prompt(`${asked}\n\n机器可读的上下文：\n${brief}`,images);
 if(agent.state.errorMessage)throw Error(agent.state.errorMessage);
 if(!init.analysis&&!validated)throw Error('模型未完成工具调用与校验；请使用支持流式工具调用的模型重试。已保存文件可在重试时继续。');
 if(!init.analysis&&validated&&!previewOk&&!exhausted&&previews===0)emit({type:'activity',message:'没有试运行：模型直接结束，产物未做运行验证'});
 if(init.analysis&&!text.trim())throw Error('模型未返回需求分析正文');
 emit({type:'done',text});
}catch(error){emit({type:'error',message:String(error?.message||error).slice(0,2000)});process.exitCode=1;}finally{lines.close();process.stdin.destroy();}
