import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
const source=readFileSync(new URL('../plugins/workshop/ui/view.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../plugins/workshop/ui/index.html',import.meta.url),'utf8');
function fixture(page='',options={}){
  class Element{
    constructor(){this.hidden=false;this.disabled=false;this.value='';this.children=[];this.classList={toggle(){},add(){},remove(){}};}
    replaceChildren(...children){this.children=children;} append(...children){this.children.push(...children);} setAttribute(){}
  }
  const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const document={body:new Element(),documentElement:{dataset:{}},hidden:false,addEventListener(){},getElementById:id=>elements[id],createElement:()=>new Element(),
    querySelector:()=>new Element(),querySelectorAll:()=>[]};
  let onContext;let onDrop;let onDrag;let hostContext={};let connect;const ready=new Promise(resolve=>{connect=resolve;});const calls=[];
  const state={projects:[],providers:[],keys:{},config:{endpoint:'',model:''},warnings:[],sdkFingerprint:'sdk'};
  const sdk={ready,context:()=>hostContext,onContext(fn){onContext=fn;},onDrop(fn){onDrop=fn;},onDrag(fn){onDrag=fn;},call:async(method,params)=>{calls.push({method,params});
    if(options.call)return options.call(method,params,{state,calls});
    if(method==='state')return state;if(method==='searchSettings')return options.searchSettings||{provider:'',endpoint:'',hasKey:false};if(method==='modelsDraft')return options.models||[];if(method==='create')return {id:'p1'};if(method==='createPath')return {id:'p1'};if(method==='catalog')return options.catalog||null;if(method==='artifacts')return [];return null;}};
  // CJS conversion deliberately rejects top-level await: mounting must not wait for the parent's load callback.
  const code=transformSync(source,{format:'cjs',target:'es2022'}).code;
  runInNewContext(code,{require:()=>sdk,document,location:{href:`http://plugin.localhost/@tool-test/ui/index.html${page}`},URL,Option:class extends Element{constructor(text,value){super();this.text=text;this.value=value;}},setInterval(){},setTimeout,clearTimeout,crypto:{randomUUID:()=> 'test'},console});
  return {elements,calls,state,connect,drop(paths){onDrop(paths);},drag(state){onDrag(state);},setPage(page){hostContext={page};onContext(hostContext);},async settle(){await new Promise(resolve=>setImmediate(resolve));}};
}
function project(overrides={}){
  return {id:'p1',name:'三维预览插件',status:'draft',messages:[],sample:null,sampleSize:0,attachments:[],extension:'',version:0,tested:false,installedVersion:null,builds:[],logs:[],shots:[],transcript:[],...overrides};
}
test('workshop mounts without waiting for host readiness, and owns no header of its own',async()=>{
 const f=fixture();
 // The page used to draw a caption and a settings button above everything. The host puts the
 // settings entry on the tab row now, so the page owes nothing above its own content.
 assert.equal(f.elements['settings-toggle'],undefined);
 assert.equal(html.includes('workshop-header'),false);
 f.connect();await f.settle();assert.equal(f.elements['create-text'].disabled,false);
});
test('bootstrap does not globally lock the page behind a second state refresh',async()=>{
 let stateCalls=0;
 const state={projects:[],providers:[],keys:{},config:{endpoint:'',model:''},warnings:[],sdkFingerprint:'sdk'};
 const f=fixture('',{call:async method=>{
   if(method==='catalog')return null;
   if(method==='state'){stateCalls++;return state;}
   if(method==='searchSettings')return {provider:'',endpoint:'',hasKey:false};
   return null;
 }});
 f.connect();await f.settle();
 assert.equal(stateCalls,1);
 assert.equal(f.elements['create-text'].disabled,false);
 assert.equal(f.elements['create-sample'].disabled,false);
 assert.equal(f.elements['new-project'].disabled,false);
});
test('a task starts from the user requirement alone, with no built-in direction',async()=>{
 const f=fixture();f.connect();await f.settle();
 f.elements.requirement.value='把 .xyz 文件渲染成三维预览';
 await f.elements['create-text'].onclick();
 const request=f.calls.find(c=>c.method==='create');
 assert.equal(request.params.requirement,'把 .xyz 文件渲染成三维预览');
 assert.equal(request.params.withSample,false);
 assert.equal(f.calls.some(c=>c.method==='start'),false);
});
test('an empty requirement without a sample is refused before any request',async()=>{
 const f=fixture();f.connect();await f.settle();
 await f.elements['create-text'].onclick();
 assert.equal(f.calls.some(c=>c.method==='create'),false);
 assert.match(f.elements.error.textContent,/描述|附加/);
});
test('a task with a sample but no requirement still generates, and the typed message is sent',async()=>{
 const f=fixture();
 f.state.projects=[project({sample:'C:/tmp/model.xyz',sampleSize:2048,extension:'xyz'})];
 f.connect();await f.settle();
 await f.elements.generate.onclick();
 let start=f.calls.filter(c=>c.method==='start').pop();
 assert.equal(start.params.id,'p1');assert.equal(start.params.message,'');
 f.elements.message.value='加上线框切换';
 await f.elements.generate.onclick();
 start=f.calls.filter(c=>c.method==='start').pop();
 assert.equal(start.params.message,'加上线框切换');
 const source=f.elements['source-files'].children[0];
 assert.equal(source.children[0].textContent,'xyz');
 assert.equal(source.children[1].children[0].textContent,'model.xyz');
 assert.match(source.children[1].children[1].textContent,/样例 · 2\.0 KB/);
});
test('the conversation keeps execution steps while the right rail is reserved for files and diagnostics',async()=>{
 const f=fixture();
 f.state.projects=[project({status:'generating',busy:true,
   logs:[{at:1758350000,status:'generating',text:'Pi Agent 已启动 · deepseek-chat'},{at:1758350020,status:'validating',text:'校验反馈：controls 图标名不存在'}],
   usage:{total_tokens:1234},
   runtimeLogs:["error: Cannot read properties of null (reading 'length')"],
   transcript:[{role:'user',text:'做一个文本预览'},{role:'assistant',text:'正在写文件…',streaming:true}]})];
 f.connect();await f.settle();
 const messages=f.elements.conversation.children;
 assert.equal(messages.length,2);
 assert.equal(messages[0].className,'message user');
 assert.equal(messages[0].children[1].textContent,'做一个文本预览');
 assert.equal(messages[1].className,'message assistant streaming');
 assert.equal(messages[1].children[0].textContent,'工坊助手');
 assert.equal(messages[1].children[1].textContent,'正在写文件…');
 // There is no duplicate stage tree: the side rail is now a compact file surface.
 assert.equal(f.elements.pipeline,undefined);
 assert.equal(f.elements['file-rail'].hidden,false);
 assert.equal(f.elements['source-files'].children[0].textContent,'暂无来源文件');
 // The page's own errors stay in the same right-side diagnostics area, not in the message.
 assert.equal(f.elements.diagnostics.hidden,false);
 assert.match(f.elements['runtime-log-lines'].children[0].textContent,/Cannot read properties of null/);
 assert.equal(messages[1].children[1].textContent.includes('Cannot read'),false);
});
test('an assistant turn reads as steps: duration, prose, then what it ran',async()=>{
 const f=fixture();
 f.state.projects=[project({status:'generating',busy:true,version:1,
   transcript:[
     {role:'user',text:'做一个文本预览'},
     {role:'assistant',text:'先读规范，然后写文件。',streaming:true,startedAt:Math.round(Date.now()/1000)-38,endedAt:0,
      events:[
        {kind:'text',text:'先读规范，然后写文件。'},
        {kind:'tool',tool:'read_file',path:'sdk.md',detail:'2048 字符'},
        {kind:'tool',tool:'write_file',path:'ui/view.js',detail:'5120 bytes',added:122,removed:8},
      ]},
   ]})];
 f.connect();await f.settle();
 const turn=f.elements.conversation.children[1];
 assert.equal(turn.className,'message assistant streaming');
 // The header says how long it has been working.
 assert.equal(turn.children[0].children[0].textContent,'工作中 38 秒');
 const events=turn.children[1].children;
 assert.equal(events.length,3);
 assert.equal(events[0].textContent,'先读规范，然后写文件。');
 assert.equal(events[1].children[1].textContent,'读取');
 assert.equal(events[1].children[2].textContent,'sdk.md');
 assert.equal(events[2].children[1].textContent,'写入');
 assert.equal(events[2].children[3].textContent,'+122 −8');
});
test('a finished turn reports how long it took',async()=>{
 const f=fixture();
 f.state.projects=[project({status:'ready',version:1,tested:true,
   builds:[{version:1,verified:true,sdkFingerprint:'sdk',summary:'完成'}],
   transcript:[{role:'assistant',text:'做好了。',streaming:false,startedAt:1758350000,endedAt:1758350021,events:[{kind:'text',text:'做好了。'}]}]})];
 f.connect();await f.settle();
 const turn=f.elements.conversation.children[0];
 assert.equal(turn.children[0].children[0].textContent,'用时 21 秒');
 assert.equal(turn.children[1].children[0].textContent,'做好了。');
});
test('a run in flight keeps the install gate closed while the agent fixes what it saw',async()=>{
 const f=fixture();
 // The self-check passed, but the run is still going: the agent owns the task until it ends.
 f.state.projects=[project({status:'ready',tested:true,selfChecked:true,version:1,busy:true,
   builds:[{version:1,verified:true,sdkFingerprint:'sdk',summary:'构建完成'}]})];
 f.connect();await f.settle();
 assert.equal(f.elements['self-check'].hidden,false);
 assert.equal(f.elements['self-check'].textContent,'模型自检通过');
 assert.equal(f.elements.install.disabled,true);
 assert.equal(f.elements.preview.disabled,true);
});
test('a self-checked build stops advertising itself as busy once the run ends',async()=>{
 const f=fixture();
 f.state.projects=[project({status:'ready',tested:true,selfChecked:true,version:1,
   builds:[{version:1,verified:true,sdkFingerprint:'sdk',summary:'构建完成'}]})];
 f.connect();await f.settle();
 assert.equal(f.elements.install.disabled,false);
 assert.equal(f.elements.install.hidden,false);
});
test('every failure reports in the diagnostics, not in the heading',async()=>{
 const f=fixture();
 f.state.projects=[project({status:'previewFailed',version:1,tested:false,
   error:'读取压缩包时发生了错误：文件里没有找到 ZIP 中央目录结束记录（EOCD）',
   runtimeLogs:['error: RangeError: Invalid array length'],
   builds:[{version:1,verified:false,sdkFingerprint:'sdk',summary:'只读浏览'}]})];
 f.connect();await f.settle();
 // The task's failure and the page's own log land in the same place.
 assert.equal(f.elements.diagnostics.hidden,false);
 assert.match(f.elements.diagnostic.textContent,/中央目录结束记录/);
 assert.match(f.elements['runtime-log-lines'].children[0].textContent,/Invalid array length/);
 assert.match(f.elements['error-raw'].textContent,/EOCD/);
 assert.equal(f.elements['error-details'].hidden,false);
});
test('a task with nothing to report shows no diagnostics',async()=>{
 const f=fixture();
 f.state.projects=[project({status:'ready',version:1,tested:true,error:null,runtimeLogs:[],
   builds:[{version:1,verified:true,sdkFingerprint:'sdk',summary:'构建完成'}]})];
 f.connect();await f.settle();
 assert.equal(f.elements.diagnostics.hidden,true);
 assert.equal(f.elements.diagnostic.textContent,'');
});
test('a name keeps its extension whole while the rest truncates',async()=>{
 const f=fixture();
 f.state.projects=[project({name:'10.0.147.251_128_20240828100217841.mp4',sample:'C:/tmp/clip.mp4',extension:'mp4'})];
 f.connect();await f.settle();
 // Two spans: the part that may be cut, and the suffix that always reads whole.
 const split=f.elements['project-name'].children[0];
 assert.equal(split.className,'name-split');
 assert.equal(split.children[0].className,'name-base');
 assert.equal(split.children[0].textContent,'10.0.147.251_128_20240828100217841');
 assert.equal(split.children[1].className,'name-ext');
 assert.equal(split.children[1].textContent,'.mp4');
 // The task row reads it the same way.
 const row=f.elements.projects.children[0].children[0].children[0];
 assert.equal(row.children[1].textContent,'.mp4');
 // A name without one stays a single piece.
 f.state.projects=[project({name:'ZIP 压缩包浏览'})];
 await f.elements.cancel.onclick();
 assert.equal(f.elements['project-name'].children[0].children.length,1);
 assert.equal(f.elements['project-name'].children[0].children[0].textContent,'ZIP 压缩包浏览');
});
test('a step that is only a blank line is not rendered',async()=>{
 const f=fixture();
 // The runner separates two assistant messages with a blank line; the steps themselves
 // are already separate, so that text step must not become an empty block.
 f.state.projects=[project({status:'generating',busy:true,version:1,transcript:[
   {role:'assistant',text:'先读规范。\n\n现在写文件。',streaming:true,startedAt:1758350000,endedAt:0,events:[
     {kind:'text',text:'先读规范。'},
     {kind:'tool',tool:'read_file',path:'sdk.md',detail:'2 字符'},
     {kind:'text',text:'\n\n'},
     {kind:'text',text:'现在写文件。'},
   ]},
 ]})];
 f.connect();await f.settle();
 const steps=f.elements.conversation.children[0].children[1].children;
 assert.equal(steps.length,3);
 assert.equal(steps[0].textContent,'先读规范。');
 assert.equal(steps[1].children[1].textContent,'读取');
 assert.equal(steps[2].textContent,'现在写文件。');
 // A runaway run of blank lines is the model's paragraph spacing, not a layout element.
 const long=fixture();
 long.state.projects=[project({status:'generating',busy:true,version:1,transcript:[
   {role:'assistant',text:'a',streaming:true,startedAt:1758350000,endedAt:0,events:[{kind:'text',text:'一段话。\n\n\n\n\n\n下一段。'}]},
 ]})];
 long.connect();await long.settle();
 assert.equal(long.elements.conversation.children[0].children[1].children[0].textContent,'一段话。\n\n下一段。');
});
test('the page never captures a frame itself',async()=>{
 const f=fixture();
 f.state.projects=[project({status:'awaitingPreview',version:1,extension:'txt',sample:'C:/tmp/a.txt'})];
 f.connect();await f.settle();
 // No capture button and no attachment chip: the agent photographs its own runs.
 assert.equal(f.elements.capture,undefined);
 assert.equal(f.elements.attachment,undefined);
 assert.equal(f.calls.some(c=>c.method==='capture'||c.method==='shot'),false);
});
test('new projects appear in the task list and a dropped file is taken by path alone',async()=>{
 const f=fixture();f.connect();await f.settle();
 assert.equal(f.elements.projects.children[0].children[0].textContent,'新插件任务');
 f.state.projects=[project({name:'名称较长的现有插件任务',sample:'C:/tmp/a.txt',extension:'txt'})];
 f.elements['new-project'].onclick();
 assert.equal(f.elements.projects.children.length,2);assert.equal(f.elements.projects.children[0].children[0].title,'未保存');
 f.elements.requirement.value='解析这个文件';
 f.drop(['C:/large/model.fbx']);await f.settle();
 const created=f.calls.find(c=>c.method==='createPath');
 assert.equal(created.params.path,'C:/large/model.fbx');assert.equal(created.params.requirement,'解析这个文件');
 // The page never carries sample bytes: a drop that is not a path cannot be created.
 assert.equal(f.calls.some(c=>c.method==='createBytes'),false);
 assert.equal(f.elements.error.hidden,true);
});
test('dropping files only lights the drop zone; nothing is imported or created',async()=>{
 const f=fixture();f.connect();await f.settle();
 f.drag('enter');f.drag('leave');
 assert.equal(f.calls.some(c=>c.method==='createPath'||c.method==='createBytes'),false);
 f.drop(['C:/a.txt','C:/b.txt']);await f.settle();
 assert.equal(f.calls.some(c=>c.method==='createPath'),false);
 assert.match(f.elements.error.textContent,/一次拖入一个/);
});
test('an open task can append several files and images from either attachment entry',async()=>{
 const f=fixture();
 f.state.projects=[project({sample:'C:/tmp/model.xyz',sampleSize:2048,extension:'xyz',attachments:[
  {path:'C:/tmp/reference.png',name:'reference.png',size:4096,image:true,mime:'image/png'},
 ]})];
 f.connect();await f.settle();
 const sources=f.elements['source-files'].children;
 assert.equal(sources.length,2);
 assert.equal(sources[0].children[1].children[0].textContent,'model.xyz');
 assert.equal(sources[1].children[1].children[0].textContent,'reference.png');
 assert.match(sources[1].children[1].children[1].textContent,/图片/);
 await f.elements['message-attach'].onclick();
 await f.elements['add-files'].onclick();
 assert.equal(f.calls.filter(call=>call.method==='addAttachments').length,2);
 f.drop(['C:/tmp/notes.txt','C:/tmp/second.png']);await f.settle();
 const added=f.calls.find(call=>call.method==='addPaths');
 assert.deepEqual(added.params.paths,['C:/tmp/notes.txt','C:/tmp/second.png']);
 assert.equal(f.calls.some(call=>call.method==='createPath'),false);
});
test('the compact file rail lists generated files as one-row truncated items',async()=>{
 const artifacts=[{name:'metadata.json',size:267,content:'{}'},{name:'ui/parsers/very-long-format-reader.js',size:32000,content:'export {}'}];
 const f=fixture('',{call:async(method,params,{state})=>{
  if(method==='state')return state;if(method==='searchSettings')return {provider:'',endpoint:'',hasKey:false};if(method==='artifacts')return artifacts;if(method==='catalog')return null;return null;
 }});
 f.state.projects=[project()];f.connect();await f.settle();
 await f.elements['inspect-artifacts'].onclick();
 const rows=f.elements['generated-files'].children;
 assert.equal(rows.length,2);
 assert.equal(rows[0].children[1].children[0].textContent,'metadata.json');
 assert.equal(rows[1].children[1].children[0].textContent,'ui/parsers/very-long-format-reader.js');
 assert.equal(rows[1].className,'rail-file');
 assert.equal(f.elements['file-metrics'].textContent,'2 个');
});
test('deleting a task asks first, and offers to uninstall when a plugin is installed',async()=>{
 const f=fixture();
 f.state.projects=[project({installedVersion:1,tested:true,status:'installed',version:1})];
 f.connect();await f.settle();
 const remove=f.elements.projects.children[0].children[1];
 assert.equal(remove.title,'删除任务');
 remove.onclick();await f.settle();
 assert.equal(f.elements.dialog.hidden,false);
 assert.match(f.elements['dialog-body'].textContent,/已经安装为插件/);
 assert.equal(f.elements['dialog-extra'].hidden,false);
 f.elements['dialog-extra'].onclick();await f.settle();
 const deleted=f.calls.find(c=>c.method==='delete');
 assert.equal(deleted.params.id,'p1');assert.equal(deleted.params.uninstall,true);
 assert.equal(f.elements.dialog.hidden,true);
});
test('deleting a task that is not installed only removes the task',async()=>{
 const f=fixture();
 f.state.projects=[project({version:1,tested:true,status:'ready'})];
 f.connect();await f.settle();
 f.elements.delete.onclick();await f.settle();
 assert.equal(f.elements['dialog-extra'].hidden,true);
 assert.match(f.elements['dialog-body'].textContent,/无法撤销/);
 f.elements['dialog-confirm'].onclick();await f.settle();
 const deleted=f.calls.find(c=>c.method==='delete');
 assert.equal(deleted.params.id,'p1');assert.equal(deleted.params.uninstall,false);
});
test('a cancelled confirmation deletes nothing',async()=>{
 const f=fixture();
 f.state.projects=[project({version:1,tested:true,status:'ready'})];
 f.connect();await f.settle();
 f.elements.delete.onclick();await f.settle();
 f.elements['dialog-cancel'].onclick();await f.settle();
 assert.equal(f.calls.some(c=>c.method==='delete'),false);
 assert.equal(f.elements.dialog.hidden,true);
});
test('trial preview opens the dedicated host window instead of embedding in settings',async()=>{
 const f=fixture();
 f.state.projects=[project({name:'HTML 预览',status:'awaitingPreview',sample:'C:/tmp/sample.html',extension:'html',version:1,builds:[{version:1,summary:'构建完成'}]})];
 f.connect();await f.settle();
 await f.elements.preview.onclick();
 const preview=f.calls.find(c=>c.method==='openPreview');
 assert.equal(preview.params.id,'p1');
 assert.equal(f.calls.some(c=>c.method==='preview'),false);
 assert.match(f.elements.notice.textContent,/独立试预览窗口/);
});
test('an installed plugin is marked in the task list and clears when it is removed',async()=>{
 const f=fixture();
 f.state.projects=[project({installedVersion:2,version:2,tested:true,status:'installed'})];
 f.connect();await f.settle();
 assert.equal(f.elements['project-flag'].hidden,false);
 assert.equal(f.elements.status.textContent,'已安装');
 // The list row marks it with a dot rather than a chip, which would push the name wide.
 assert.equal(f.elements.projects.children[0].children[0].className,'project-item installed');
 // The host answers the next poll with the plugin gone, which is what uninstalling does.
 f.state.projects[0]={...f.state.projects[0],installedVersion:null,status:'ready'};
 await f.elements.cancel.onclick();
 assert.equal(f.elements['project-flag'].hidden,true);
 assert.equal(f.elements.status.textContent,'试预览完成，可以安装');
 assert.equal(f.elements.projects.children[0].children[0].className,'project-item');
});
test('provider form exists only on the plugin settings surface',async()=>{
 const generation=fixture();generation.connect();await generation.settle();assert.equal(generation.elements.settings.hidden,true);
 const settings=fixture('?page=settings');settings.connect();await settings.settle();assert.equal(settings.elements.settings.hidden,false);assert.equal(settings.elements['generation-area'].hidden,true);
});
test('saved providers keep connection parameters collapsed until requested',async()=>{
 const f=fixture('?page=settings');
 const provider={id:'configured',preset:'custom',name:'Command Code',endpoint:'https://example.test/v1',model:'coding-model'};
 f.state.providers=[provider];f.state.config=provider;f.state.keys.configured=true;
 f.connect();await f.settle();
 assert.equal(f.elements['connection-details'].open,false);
 assert.equal(f.elements['connection-summary'].textContent,'已配置');
 assert.equal(f.elements['provider-state'].textContent,'使用中');
 f.elements['new-provider'].onclick();
 assert.equal(f.elements['connection-details'].open,true);
 assert.equal(f.elements['provider-state'].textContent,'未保存');
});
test('provider type changes synchronise its dependent fields and create a visible draft',async()=>{
 const catalog={presets:[
  {id:'custom',name:'自定义服务',endpoint:''},
  {id:'siliconflow',name:'SiliconFlow 硅基流动',endpoint:'https://api.siliconflow.cn/v1'},
  {id:'deepseek',name:'DeepSeek',endpoint:'https://api.deepseek.com/v1'}
 ],models:[]};
 const f=fixture('?page=settings',{catalog});
 const provider={id:'configured',preset:'siliconflow',name:'SiliconFlow 硅基流动',endpoint:'https://api.siliconflow.cn/v1',model:'old-model'};
 f.state.providers=[provider];f.state.config=provider;f.state.keys.configured=true;
 f.connect();await f.settle();
 f.elements.preset.value='deepseek';f.elements.preset.onchange();
 assert.equal(f.elements['provider-name'].value,'DeepSeek');
 assert.equal(f.elements.endpoint.value,'https://api.deepseek.com/v1');
 assert.equal(f.elements.model.value,'');
 assert.equal(f.elements['provider-state'].textContent,'未保存更改');
 f.elements['new-provider'].onclick();
 assert.equal(f.elements.providers.children.length,2);
 assert.equal(f.elements.providers.children[0].children[1].textContent,'未选择模型 · 未保存');
 f.elements.preset.value='deepseek';f.elements.preset.onchange();
 assert.equal(f.elements.providers.children[0].children[0].textContent,'DeepSeek');
 assert.equal(f.calls.some(c=>c.method==='configure'),false);
 assert.match(f.elements['model-status'].textContent,/API Key/);
});
test('a stored API key is represented as configured until the user resets it',async()=>{
 const f=fixture('?page=settings');
 const provider={id:'configured',preset:'custom',name:'Gateway',endpoint:'https://example.test/v1',model:'model'};
 f.state.providers=[provider];f.state.config=provider;f.state.keys.configured=true;
 f.connect();await f.settle();
 assert.equal(f.elements['key-configured'].hidden,false);assert.equal(f.elements['key-editor'].hidden,true);
 f.elements['reset-key'].onclick();
 assert.equal(f.elements['key-configured'].hidden,true);assert.equal(f.elements['key-editor'].hidden,false);
 assert.equal(f.elements['key-status'].textContent,'请输入新的密钥');
});
test('model discovery fills the direct selector without saving the provider first',async()=>{
 const f=fixture('?page=settings',{models:['model-a','model-b']});f.connect();await f.settle();
 f.elements.endpoint.value='https://example.test/v1';f.elements.key.value='dummy-test-key';
 f.elements.key.onchange();await f.settle();
 const discovery=f.calls.find(c=>c.method==='modelsDraft');assert.equal(discovery.params.config.endpoint,'https://example.test/v1');assert.equal(discovery.params.key,'dummy-test-key');
 assert.equal(f.calls.some(c=>c.method==='configure'),false);
 assert.equal(f.elements.model.children.length,3);
 f.elements.model.value='model-b';f.elements.model.onchange();await f.elements['save-config'].onclick();
 const saved=f.calls.find(c=>c.method==='configure');assert.equal(saved.params.config.model,'model-b');
 assert.equal(saved.params.config.maxTokens,null);
 assert.equal(f.elements.key.value,'');
});
test('an empty output limit is sent as null instead of a guessed default',async()=>{
 const f=fixture('?page=settings');f.connect();await f.settle();
 f.elements.endpoint.value='https://example.test/v1';f.elements.model.value='deepseek-chat';
 await f.elements['save-config'].onclick();
 const saved=f.calls.find(c=>c.method==='configure');
 assert.equal(saved.params.config.maxTokens,null);
 assert.equal(saved.params.config.contextWindow,null);
 assert.equal(saved.params.config.temperature,null);
});
test('legacy user budgets do not block provider configuration',async()=>{
 const f=fixture('?page=settings');f.connect();await f.settle();
 f.elements.endpoint.value='https://example.test/v1';f.elements.model.value='m';
 assert.equal(f.elements['context-window'],undefined);assert.equal(f.elements['max-tokens'],undefined);
 await f.elements['save-config'].onclick();
 assert.equal(f.calls.some(c=>c.method==='configure'),true);
 assert.equal(f.calls.find(c=>c.method==='configure').params.config.maxTokens,null);
});
test('host settings context overrides missing or stale iframe URL parameters',async()=>{
 const f=fixture();f.setPage('settings');f.connect();await f.settle();
 assert.equal(f.elements.settings.hidden,false);assert.equal(f.elements['generation-area'].hidden,true);
 f.setPage('workshop');assert.equal(f.elements.settings.hidden,true);assert.equal(f.elements['generation-area'].hidden,false);
});

test('the search engine is configurable, and its key is never kept in the page',async()=>{
 const f=fixture('',{searchSettings:{provider:'searxng',endpoint:'https://searx.example',hasKey:false}});
 f.connect();await f.settle();
 // The saved setting arrives from the host and fills the form.
 assert.equal(f.elements['search-provider'].value,'searxng');
 assert.equal(f.elements['search-endpoint'].value,'https://searx.example');
 // Saving sends what was typed and clears the field afterwards.
 f.elements['search-provider'].value='tavily';
 f.elements['search-endpoint'].value='';
 f.elements['search-key'].value='tvly-secret';
 await f.elements['search-save'].onclick();
 const saved=f.calls.filter(c=>c.method==='configureSearch').pop();
 assert.equal(saved.params.config.provider,'tavily');
 assert.equal(saved.params.config.key,'tvly-secret');
 assert.equal(f.elements['search-key'].value,'');
 // Reset asks the host to drop the stored key rather than sending an empty one.
 f.elements['search-reset-key'].onclick();
 await f.elements['search-save'].onclick();
 assert.equal(f.calls.filter(c=>c.method==='configureSearch').pop().params.clearKey,true);
});

test('the search engine shows only the settings its source needs',async()=>{
 const f=fixture('',{searchSettings:{provider:'',endpoint:'',hasKey:false}});
 f.connect();await f.settle();
 // Nothing chosen: the source is all there is to see, so no field looks like it wants filling.
 assert.equal(f.elements['search-endpoint-row'].hidden,true);
 assert.equal(f.elements['search-key-row'].hidden,true);
 assert.equal(f.elements['search-state'].textContent,'未配置');
 // SearXNG is an address, and a token only if the instance asks for one.
 f.elements['search-provider'].value='searxng';
 f.elements['search-provider'].onchange();
 assert.equal(f.elements['search-endpoint-row'].hidden,false);
 assert.equal(f.elements['search-key-row'].hidden,false);
 assert.match(f.elements['search-key-status'].textContent,/一般留空/);
 // Tavily has an address of its own, so only its key is asked for.
 f.elements['search-provider'].value='tavily';
 f.elements['search-provider'].onchange();
 assert.equal(f.elements['search-endpoint-row'].hidden,true);
 assert.equal(f.elements['search-key-row'].hidden,false);
 assert.match(f.elements['search-key-status'].textContent,/必填/);
 // Back to nothing: the fields go away again rather than linger as empty boxes.
 f.elements['search-provider'].value='';
 f.elements['search-provider'].onchange();
 assert.equal(f.elements['search-endpoint-row'].hidden,true);
 assert.equal(f.elements['search-key-row'].hidden,true);
});
// A page whose markup is unbalanced is not a cosmetic problem: an element left open nests the
// rest of the document inside it, so `#generation-area` become a child of the hidden settings
// section — a blank page with no error anywhere. That is exactly what a stray closing tag did.
test('the page markup is balanced, so no section swallows the rest of the document', () => {
  const voids = new Set(["br", "img", "input", "meta", "link", "hr", "source", "track", "wbr", "area", "base", "col", "embed", "param"]);
  const stack = [];
  const problems = [];
  for (const tag of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const name = tag[1].toLowerCase();
    if (voids.has(name) || tag[0].endsWith("/>")) continue;
    if (!tag[0].startsWith("</")) { stack.push({ name, at: tag.index }); continue; }
    const top = stack[stack.length - 1];
    if (top?.name === name) { stack.pop(); continue; }
    const found = stack.map((entry) => entry.name).lastIndexOf(name);
    if (found < 0) { problems.push(`stray </${name}>`); continue; }
    // Closing a tag that is not the innermost one means something above it was never closed.
    problems.push(`</${name}> closes across ${stack.slice(found + 1).map((entry) => entry.name).join(" ")}`);
    stack.length = found;
  }
  for (const left of stack) problems.push(`unclosed <${left.name}>`);
  assert.deepEqual(problems, []);
  // And the two views really are siblings, which is what makes hiding one show the other.
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.includes("settings") && ids.includes("generation-area"));
});
