import {call,ready,context,onContext,onDrop,onDrag} from './sdk-tool.js';
// The module resolved, but the page is only usable once the host has handed it a port: a
// page that says "booted" here and then waits forever for a connection is exactly the blank
// screen nobody can explain. So the page bootstrap is told when that handshake has happened,
// and its watchdog reports one that never does.
globalThis.__emberModuleLoaded?.();
const $=id=>document.getElementById(id);
let settingsPage=new URL(location.href).searchParams.get('page')==='settings';
function applyPage(page){
  if(page)settingsPage=page==='settings';
  document.body.classList.toggle('settings-page',settingsPage);
  $('generation-area').hidden=settingsPage;$('settings').hidden=!settingsPage;
}
let state, selected, polling=false, busy=false, creatingProject=false;
let editingProvider='', draftingProvider=false, credentialConfigured=false, keyReset=false, lastPresetName='', catalog={presets:[],models:[]};
let modelLoadSequence=0;
applyPage();
$('reveal-key').onclick=()=>{const hidden=$('key').type==='password';$('key').type=hidden?'text':'password';$('reveal-key').textContent=hidden?'隐藏':'显示';$('reveal-key').setAttribute('aria-label',hidden?'隐藏密钥':'显示密钥');};
$('reset-key').onclick=()=>{keyReset=true;credentialConfigured=false;showKeyState();markProviderDirty();$('key').focus?.();};
function formatBytes(size){
  if(!size)return '';
  const units=['B','KB','MB','GB'];let value=size,unit=0;
  while(value>=1024&&unit<units.length-1){value/=1024;unit++;}
  return `${unit===0?value:value.toFixed(1)} ${units[unit]}`;
}
const baseName=path=>String(path||'').split(/[\/]/).pop()||'';
// A task is often named after the file it was created for. Keeping the extension whole
// lets the name truncate and still say what kind of file the task is about.
const EXTENSION=/^(.+?)(\.[A-Za-z0-9]{1,8})$/;
function nameNode(value){
  const name=String(value||'');
  const parts=EXTENSION.exec(name);
  const wrap=document.createElement('span');wrap.className='name-split';
  const base=document.createElement('span');base.className='name-base';
  base.textContent=parts?parts[1]:name;
  wrap.append(base);
  if(parts){const suffix=document.createElement('span');suffix.className='name-ext';suffix.textContent=parts[2];wrap.append(suffix);}
  return wrap;
}
function populatePresets(){
  const list=$('preset');list.replaceChildren();
  for(const preset of catalog.presets||[])list.append(new Option(preset.name,preset.id));
  list.value='custom';
}
function providerLabel(provider){
  return provider.name||provider.model||provider.endpoint||'未命名供应商';
}
function selectedPreset(){return (catalog.presets||[]).find(entry=>entry.id===$('preset').value);}
function showKeyState(){
  $('key-configured').hidden=!credentialConfigured;
  $('key-editor').hidden=credentialConfigured;
  $('key-status').textContent=credentialConfigured?'安全保存在本机凭据管理器':keyReset?'请输入新的密钥':'未配置密钥，本机服务可以留空';
  updateConnectionSummary();
}
function updateConnectionSummary(config){
  const endpoint=$('endpoint').value.trim();
  const hasKey=!!$('key').value||credentialConfigured;
  $('connection-summary').textContent=!endpoint?'需要配置':hasKey?'已配置':'接口已配置';
}
function syncProviderDraft(){
  if(draftingProvider){
    const name=$('provider-name').value.trim()||selectedPreset()?.name||'新供应商';
    $('provider-title').textContent=name;
  }else if(editingProvider&&$('provider-name').value.trim())$('provider-title').textContent=$('provider-name').value.trim();
  populateProviders();
}
function markProviderDirty(){$('provider-state').textContent='未保存更改';$('provider-state').classList.remove('active');syncProviderDraft();}
function providerConfig(){
  const optional=id=>{const value=$(id).value.trim();return value===''?null:Number(value);};
  return {id:editingProvider,preset:$('preset').value,name:$('provider-name').value.trim(),endpoint:$('endpoint').value.trim(),model:$('model').value,maxTokens:null,contextWindow:null,temperature:optional('temperature'),timeoutSeconds:optional('timeout')};
}
function renderModelOptions(models,current=''){
  const values=[...new Set([current,...models].filter(Boolean))];
  $('model').replaceChildren(new Option(values.length?'选择模型':'暂无可用模型',''),...values.map(id=>new Option(id,id)));
  $('model').value=current&&values.includes(current)?current:'';
}
async function loadModelsForDraft(current=$('model').value){
  const endpoint=$('endpoint').value.trim();const preset=selectedPreset();const key=$('key').value.trim();
  const local=!!preset?.local||/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(endpoint);
  if(!endpoint){renderModelOptions([],current);$('model-status').textContent='配置接口后自动获取可用模型';return;}
  if(!local&&!credentialConfigured&&!key){renderModelOptions([],current);$('model-status').textContent='配置 API Key 后自动获取可用模型';return;}
  const sequence=++modelLoadSequence;$('model').disabled=true;$('model-status').textContent='正在获取可用模型…';
  try{
    const models=await call('modelsDraft',{config:providerConfig(),key});
    if(sequence!==modelLoadSequence)return;
    renderModelOptions(models,current);$('model-status').textContent=models.length?`${models.length} 个可用模型`:'服务商没有返回模型';
  }catch(e){if(sequence===modelLoadSequence){renderModelOptions([],current);$('model-status').textContent=`模型列表获取失败：${String(e)}`;}}
  finally{if(sequence===modelLoadSequence)$('model').disabled=false;}
}
function populateProviders(){
  const list=$('providers');list.replaceChildren();
  const providers=state.providers||[];
  $('providers-empty').hidden=!!providers.length||draftingProvider;
  if(draftingProvider){
    const draft=document.createElement('button');draft.type='button';draft.className='provider-item selected draft';
    const name=document.createElement('strong');name.textContent=$('provider-name').value.trim()||selectedPreset()?.name||'新供应商';
    const meta=document.createElement('span');meta.textContent=[$('model').value.trim()||'未选择模型','未保存'].join(' · ');
    draft.append(name,meta);list.append(draft);
  }
  for(const provider of providers){
    const button=document.createElement('button');
    button.type='button';
    button.className=provider.id===editingProvider?'provider-item selected':'provider-item';
    const name=document.createElement('strong');name.textContent=providerLabel(provider);
    const meta=document.createElement('span');
    meta.textContent=[provider.model,provider.id===state.config?.id?'使用中':null,state.keys?.[provider.id]?'已存密钥':'无密钥'].filter(Boolean).join(' · ');
    button.append(name,meta);
    button.onclick=()=>editProvider(provider);
    list.append(button);
  }
}
function editProvider(config){
  draftingProvider=!config;
  editingProvider=config?.id||`provider-${crypto.randomUUID()}`;
  $('provider-title').textContent=config?providerLabel(config):'添加供应商';
  $('preset').value=config?.preset||'custom';
  lastPresetName=selectedPreset()?.name||'';
  $('provider-name').value=config?.name||'';
  $('endpoint').value=config?.endpoint||'';
  renderModelOptions([],config?.model||'');
  $('temperature').value=config?.temperature??'';
  $('timeout').value=config?.timeoutSeconds??'';
  $('key').value='';$('key').type='password';$('reveal-key').textContent='显示';$('test-result').textContent='';
  $('remove-provider').disabled=draftingProvider;
  credentialConfigured=!!editingProvider&&!!state.keys?.[editingProvider];keyReset=false;showKeyState();
  const active=!!config&&config.id===state.config?.id;
  $('provider-state').textContent=active?'使用中':config?'已保存':'未保存';
  $('provider-state').classList.toggle('active',active);
  $('connection-details').open=!config||!config.endpoint;
  $('advanced').open=false;
  updateConnectionSummary(config);
  populateProviders();
  if(settingsPage)void loadModelsForDraft(config?.model||'');
}
$('new-provider').onclick=()=>{editProvider(null);$('notice').textContent='';};
$('preset').onchange=()=>{
  const preset=selectedPreset();
  if(!preset)return;
  const name=$('provider-name').value.trim();
  $('endpoint').value=preset.endpoint||'';
  if(draftingProvider||!name||name===lastPresetName)$('provider-name').value=preset.name;
  lastPresetName=preset.name;
  renderModelOptions([],'');$('model-status').textContent='正在更新可用模型…';
  credentialConfigured=false;keyReset=false;$('key').value='';showKeyState();
  $('connection-details').open=true;
  markProviderDirty();
  void loadModelsForDraft();
  $('notice').textContent=preset.endpoint?`已填入 ${preset.name} 的接口地址，保存后可获取模型列表`:'请填写接口地址';
};
$('model').onchange=()=>{$('test-result').textContent='模型已更改，尚未测试';markProviderDirty();};
$('endpoint').oninput=()=>{credentialConfigured=false;keyReset=false;showKeyState();markProviderDirty();};
$('endpoint').onchange=()=>void loadModelsForDraft();
$('key').oninput=()=>{updateConnectionSummary();markProviderDirty();};
$('key').onchange=()=>void loadModelsForDraft();
$('provider-name').oninput=markProviderDirty;
$('temperature').oninput=markProviderDirty;$('timeout').oninput=markProviderDirty;
let activePane='progress';
function selectPane(name){activePane=name;$('workspace-content').classList.toggle('show-files',name==='files');for(const tab of document.querySelectorAll('[data-pane]'))tab.classList.toggle('selected',tab.dataset.pane===name);for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel==='files'&&name!=='files';}
for(const tab of document.querySelectorAll('[data-pane]'))tab.onclick=()=>selectPane(tab.dataset.pane);
function diagnosticText(message){
 if(/429|rate_limit_error/.test(message))return '供应商暂时繁忙，重试仍未成功。已保存生成文件，可稍后继续或前往设置更换模型。';
 if(/502|503|504/.test(message))return '供应商暂时不可用。已保存生成文件，可稍后继续。';
 return message;
}
const labels={analyzing:'正在分析需求',planned:'需求分析完成',draft:'待生成',generating:'正在生成代码',validating:'正在校验规范',building:'正在构建插件包',awaitingPreview:'构建完成，请试预览',ready:'试预览完成，可以安装',installed:'已安装',failed:'生成失败，可修改需求后重试',previewFailed:'试预览失败',cancelled:'已取消',interrupted:'任务中断，可重试'};
// A run owns the task until it ends, which the status alone cannot say: a self-check
// leaves a verdict behind while the agent is still fixing what it saw.
const running=p=>!!p.busy||['analyzing','generating','validating','building','installing'].includes(p.status);
function error(e){$('error').hidden=!e;$('error').textContent=e?String(e):'';}
async function action(fn){if(busy)return;busy=true;error(null);if(state)render();try{await fn();await refresh();}catch(e){error(e);}finally{busy=false;if(state)render();}}
function current(){return state?.projects.find(p=>p.id===selected);}
function build(p){return p.builds?.find(item=>item.version===p.version);}

/* ---------- conversation ----------
   One turn reads the way a coding agent's does: how long it has been working, what it
   said, and the steps it ran between saying it. */
const TOOL_ICONS={read_file:'file-text',write_file:'file-pen',edit_file:'pencil',validate:'shield-check',preview:'play',list_icons:'shapes',add_dependency:'package-plus',search_web:'search',read_docs:'book-open',read_page:'globe'};
const TOOL_VERBS={read_file:'读取',write_file:'写入',edit_file:'修改',validate:'校验',preview:'试运行',list_icons:'查询图标',add_dependency:'取用库',search_web:'联网搜索',read_docs:'查文档',read_page:'读取网页'};
const icons=new Map();
function icon(name){
  if(icons.has(name))return icons.get(name);
  const pending=call('icons',{name}).catch(()=>null);
  icons.set(name,pending);
  return pending;
}
function toolRow(event){
  const row=document.createElement('div');row.className='tool-row';
  const mark=document.createElement('span');mark.className='tool-icon';
  void icon(TOOL_ICONS[event.tool]||'wrench').then(svg=>{if(svg)mark.innerHTML=svg;});
  const verb=document.createElement('span');verb.className='tool-verb';
  verb.textContent=TOOL_VERBS[event.tool]||event.tool;
  row.append(mark,verb);
  if(event.path){const path=document.createElement('span');path.className='tool-target';path.textContent=event.path;row.append(path);}
  if(event.added||event.removed){const stat=document.createElement('span');stat.className='tool-stat';
    stat.textContent=[event.added?`+${event.added}`:'',event.removed?`−${event.removed}`:''].filter(Boolean).join(' ');
    row.append(stat);}
  if(event.detail){const detail=document.createElement('span');detail.className='tool-detail';detail.textContent=event.detail;row.append(detail);}
  return row;
}
function turnEvent(event){
  if(event.kind==='tool')return toolRow(event);
  const body=document.createElement('div');body.className='message-body';
  // A step that is only whitespace is not a step, and a run of blank lines is the model's
  // paragraph spacing run wild: both are collapsed here, since steps are already separate.
  body.textContent=(event.text||'').replace(/\n{3,}/g,'\n\n').trim();
  return body;
}

function turnState(turn){
  if(turn.role!=='assistant')return '';
  const started=turn.startedAt||0;
  if(turn.streaming)return started?`工作中 ${Math.max(0,Math.round(Date.now()/1000-started))} 秒`:'工作中';
  const seconds=started&&turn.endedAt?turn.endedAt-started:0;
  return seconds?`用时 ${seconds} 秒`:'';
}
function messageNode(turn){
  const item=document.createElement('li');
  item.className=`message ${turn.role==='assistant'?'assistant':'user'}${turn.streaming?' streaming':''}`;
  const author=document.createElement('div');author.className='message-author';
  author.textContent=turn.role==='assistant'?'工坊助手':'你';
  const state=turnState(turn);
  if(state){const clock=document.createElement('span');clock.className='message-state';clock.textContent=state;author.append(clock);}
  item.append(author);
  const events=(turn.events||[]).filter(event=>event.kind!=='text'||String(event.text||'').trim());
  if(events.length){
    const list=document.createElement('div');list.className='turn-events';
    list.replaceChildren(...events.map(turnEvent));
    item.append(list);
  }else{
    const body=document.createElement('div');body.className='message-body';
    body.textContent=turn.text||(turn.streaming?'正在处理…':'');
    item.append(body);
  }
  return item;
}
let transcriptSignature='';
function renderConversation(p){
  const turns=p.transcript||[];
  const signature=JSON.stringify([turns,p.status,turns.some(turn=>turn.streaming)?Math.round(Date.now()/1000):0]);
  if(signature===transcriptSignature)return;
  transcriptSignature=signature;
  const scroll=$('conversation-scroll');
  const follow=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<48;
  const list=$('conversation');
  if(!turns.length){
    const empty=document.createElement('li');empty.className='chat-empty';
    empty.textContent='还没有对话。写下需求后点击「生成插件」，这里会显示模型的回复。';
    list.replaceChildren(empty);
  }else list.replaceChildren(...turns.map(messageNode));
  // A tall panel scrolls to the newest message now; a short one only knows how tall it
  // became after the browser laid it out, so it catches up on the next turn.
  if(follow){
    scroll.scrollTop=scroll.scrollHeight;
    setTimeout(()=>{scroll.scrollTop=scroll.scrollHeight;},0);
  }
}
/* ---------- the task's progress, kept apart from what the model said ----------
   One tree: each stage is a node, and the execution record lines the task wrote while that
   stage was current hang under it. A node opens to show them. */
const phases=[['需求分析',['analyzing','planned']],['代码生成',['generating']],['规范校验',['validating']],['构建插件',['building']],['试预览',['awaitingPreview','previewFailed','ready','installed']]];
const nodeOpen=new Map();
let flowSignature='';
function phaseOf(status){return phases.findIndex(([,statuses])=>statuses.includes(status));}
function clock(at){return at?new Date(at*1000).toLocaleTimeString()+'  ':'';}
function renderFlow(p){
  const signature=JSON.stringify([p.status,p.logs,p.usage,p.version,p.tested,p.runtimeLogs,p.error,state.sdkFingerprint,build(p)?.summary]);
  if(signature===flowSignature)return;
  flowSignature=signature;
  const active=phaseOf(p.status);
  // A line belongs to the stage that was current when it was written; anything written
  // outside a stage (installed, cancelled, a plugin removed elsewhere) belongs to the last
  // stage the task reached, which is where the reader looks for it.
  const groups=phases.map(()=>[]);
  for(const entry of p.logs||[]){
    const own=entry.status?phaseOf(entry.status):-1;
    groups[own<0?Math.max(active,0):own].push(entry);
  }
  const summary=build(p)?.summary;
  if(summary)groups[3].unshift({at:0,status:'',text:summary});
  $('pipeline').replaceChildren(...phases.map(([label],i)=>{
    const li=document.createElement('li');
    li.className=`node${i===active?' active':''}${i<active?' complete':''}`;
    const head=document.createElement('button');
    head.type='button';head.className='node-head';
    const open=nodeOpen.has(label)?nodeOpen.get(label):i===active;
    head.setAttribute('aria-expanded',String(open));
    head.textContent=`${label}${groups[i].length?` · ${groups[i].length}`:''}`;
    head.onclick=()=>{nodeOpen.set(label,!open);render();};
    li.append(head);
    const entries=document.createElement('ul');
    entries.className='node-entries';entries.hidden=!open;
    entries.replaceChildren(...groups[i].map(entry=>{const row=document.createElement('li');row.textContent=`${clock(entry.at)}${entry.text}`;return row;}));
    li.append(entries);
    return li;
  }));
  $('flow-metrics').textContent=p.usage?.total_tokens?`${p.usage.total_tokens.toLocaleString()} tokens`:'';
  $('generation-wait').hidden=!running(p);
  // Everything that went wrong belongs here: the task's own failure, the note that the
  // host SDK changed, and whatever the plugin's document logged while it ran.
  const sdkChanged=!!(build(p)&&build(p).sdkFingerprint!==state.sdkFingerprint);
  const message=sdkChanged?'宿主 SDK 已更新，请重新生成并试预览。已安装版本不受影响。':(p.error?diagnosticText(p.error):'');
  $('diagnostic').textContent=message;
  $('error-details').hidden=!p.error;
  $('error-raw').textContent=p.error||'';
  $('build-result').hidden=!summary;
  const diagnostics=p.runtimeLogs||[];
  $('runtime-log-lines').replaceChildren(...diagnostics.map(line=>{const row=document.createElement('div');row.textContent=line;return row;}));
  $('diagnostics').hidden=!message&&!diagnostics.length;
}
let artifactSignature='';
async function refreshArtifacts(){
  if(!selected)return;
  const id=selected;const files=await call('artifacts',{id});if(selected!==id)return;
  const signature=JSON.stringify(files);if(signature===artifactSignature)return;artifactSignature=signature;
  const opened=new Set([...$('artifact-files').querySelectorAll('details[open]')].map(item=>item.dataset.name));
  $('artifact-files').replaceChildren(...files.map(file=>{const details=document.createElement('details');details.dataset.name=file.name;details.open=opened.has(file.name);const title=document.createElement('summary');title.textContent=`${file.name} · ${formatBytes(file.size)}`;const pre=document.createElement('pre');pre.textContent=file.content;details.append(title,pre);return details;}));
}
$('inspect-artifacts').onclick=()=>action(refreshArtifacts);
function resetProjectView(){artifactSignature='';transcriptSignature='';flowSignature='';$('artifact-files').replaceChildren();}
function renderProjectList(){
  const projects=state?.projects||[];
  $('empty-projects').hidden=!!projects.length||creatingProject;
  const list=$('projects');list.replaceChildren();
  if(creatingProject){
    const row=document.createElement('div');row.className='project-row draft';
    const draft=document.createElement('button');draft.type='button';draft.className='project-item';draft.textContent='新插件任务';draft.title='未保存';
    row.append(draft);list.append(row);
  }
  for(const p of projects){
    const row=document.createElement('div');
    row.className=`project-row${!creatingProject&&p.id===selected?' selected':''}`;
    const button=document.createElement('button');
    // The row is narrow: an installed task is marked with a dot, and the header carries
    // the wording, so the name keeps the line.
    button.type='button';button.className=p.installedVersion?'project-item installed':'project-item';
    button.replaceChildren(nameNode(p.name));button.title=p.name;
    button.onclick=()=>{resetProjectView();creatingProject=false;selected=p.id;render();};
    row.append(button);
    const remove=document.createElement('button');
    remove.type='button';remove.className='project-remove';remove.textContent='×';remove.title='删除任务';
    remove.setAttribute('aria-label',`删除任务：${p.name}`);
    remove.onclick=()=>{void action(()=>removeProject(p.id));};
    row.append(remove);
    list.append(row);
  }
}
function render(){
  $('provider-hint').textContent=state.config?.model?`${providerLabel(state.config)} · ${state.config.model}`:'开始前，请通过右上角入口配置供应商和模型。';
  renderProjectList();
  // The confirmation buttons must stay clickable while the rest of the page waits.
  for(const button of document.querySelectorAll('button'))if(!button.closest?.('#dialog')&&!button.className?.includes('node-head'))button.disabled=busy;
  populateProviders();
  const p=current();$('creator').hidden=!!p;$('project').hidden=!p;if(!p)return;
  $('project-name').replaceChildren(nameNode(p.name));$('project-flag').hidden=!p.installedVersion;
  // The agent runs the plugin itself now, so say whose eyes approved this build.
  $('self-check').hidden=!p.selfChecked;$('self-check').textContent='模型自检通过';
  $('status').textContent=p.status==='failed'&&/429|502|503|504/.test(p.error||'')?'服务暂不可用':labels[p.status]||p.status;
  $('generate').textContent=['failed','cancelled','interrupted'].includes(p.status)?'继续生成':p.status==='previewFailed'?'修复预览问题':p.version?'重新生成':'生成插件';
  const name=baseName(p.sample);const hasSample=!!p.sample;
  $('sample-card').hidden=!hasSample;
  if(hasSample){
    $('sample-badge').textContent=((p.extension||'').toUpperCase()||'FILE').slice(0,4);
    $('sample-name').textContent=name;
    $('sample-info').textContent=[formatBytes(p.sampleSize),p.version?`构建 ${p.version}`:'待生成'].filter(Boolean).join(' · ');
  }
  $('sample').hidden=hasSample;
  $('sample').textContent=hasSample?'':'这个任务没有样例文件，模型会按需求决定插件支持的扩展名。';
  renderConversation(p);renderFlow(p);
  // The gates below care about the same fact the diagnostics report: a build made against
  // an older SDK cannot be installed or shared.
  const sdkChanged=!!(build(p)&&build(p).sdkFingerprint!==state.sdkFingerprint);
  $('analyze').disabled=busy||running(p);
  $('restore').disabled=busy||running(p)||!p.builds?.some(b=>b.verified&&b.version<p.version);
  $('cancel').hidden=!running(p);$('preview').hidden=!p.version;$('install').hidden=!p.tested;
  $('generate').classList.toggle('primary',!p.version||p.status==='previewFailed');
  $('generate').disabled=busy||running(p);$('cancel').disabled=busy||!running(p);
  $('preview').disabled=busy||running(p)||!p.version||!p.sample||sdkChanged;
  $('install').disabled=busy||!p.tested||running(p)||sdkChanged;$('export').disabled=busy||!p.tested||running(p)||sdkChanged;$('open').disabled=busy||!p.installedVersion||!p.sample;
  $('delete').disabled=busy||running(p);
}
async function refresh(){state=await call('state');render();}
/* ---------- confirmation, drawn in the page: a sandboxed iframe has no native dialog ---------- */
let dialogResolve=null;
function closeDialog(choice){$('dialog').hidden=true;const resolve=dialogResolve;dialogResolve=null;if(resolve)resolve(choice);}
function ask(options){
  return new Promise(resolve=>{
    dialogResolve=resolve;
    $('dialog-title').textContent=options.title;
    $('dialog-body').textContent=options.body;
    $('dialog-confirm').textContent=options.confirm;
    $('dialog-extra').hidden=!options.extra;
    $('dialog-extra').textContent=options.extra||'';
    $('dialog').hidden=false;
  });
}
$('dialog-cancel').onclick=()=>closeDialog(null);
$('dialog-confirm').onclick=()=>closeDialog('confirm');
$('dialog-extra').onclick=()=>closeDialog('extra');
async function removeProject(id){
  const project=state.projects.find(item=>item.id===id);
  if(!project)return;
  const installed=!!project.installedVersion;
  const choice=await ask({
    title:'删除任务',
    body:installed
      ?`「${project.name}」已经安装为插件。删除任务会移除本机保存的插件源码、构建产物和对话记录；已安装的插件仍在插件管理中，可以在那里卸载。`
      :`删除「${project.name}」？本机保存的插件源码、构建产物和对话记录都会被移除，无法撤销。`,
    confirm:'删除任务',
    extra:installed?'删除并卸载插件':'',
  });
  if(!choice)return;
  await call('delete',{id,uninstall:choice==='extra'});
  if(selected===id){selected=null;resetProjectView();}
  $('notice').textContent='任务已删除';
}
/* ---------- the general web engine the agent's lookups may use ---------- */
let searchKeyConfigured=false, searchKeyReset=false;
function showSearchKeyState(){
  $('search-key-configured').hidden=!searchKeyConfigured;
  $('search-key-editor').hidden=searchKeyConfigured;
  $('search-key-status').textContent=searchKeyConfigured?'安全保存在本机凭据管理器':searchKeyReset?'请输入新的密钥':'只有 Tavily 与需要鉴权的实例要填';
}
function syncSearchFields(){
  const provider=$('search-provider').value;
  // Only what the chosen source actually needs is shown: an address box next to Tavily, or a
  // key box next to a source that takes no key, reads as something that still has to be filled
  // in. SearXNG is wherever the machine runs it and may want a token; Tavily has an address of
  // its own and always takes a key.
  $('search-endpoint-row').hidden=provider!=='searxng';
  $('search-key-row').hidden=!provider;
  $('search-key-status').textContent=searchKeyConfigured
    ? '安全保存在本机凭据管理器'
    : searchKeyReset
      ? '请输入新的密钥'
      : provider==='tavily'
        ? '在 Tavily 控制台创建，必填'
        : '实例需要鉴权时填，一般留空';
  $('search-state').textContent=!provider?'未配置':(searchKeyConfigured||$('search-key').value)?'已配置':'待保存';
}
$('search-provider').onchange=syncSearchFields;
$('search-reveal-key').onclick=()=>{const hidden=$('search-key').type==='password';$('search-key').type=hidden?'text':'password';$('search-reveal-key').textContent=hidden?'隐藏':'显示';$('search-reveal-key').setAttribute('aria-label',hidden?'隐藏密钥':'显示密钥');};
$('search-reset-key').onclick=()=>{searchKeyReset=true;searchKeyConfigured=false;showSearchKeyState();$('search-key').focus?.();};
async function loadSearchSettings(){
  const settings=await call('searchSettings');
  $('search-provider').value=settings.provider||'';
  $('search-endpoint').value=settings.endpoint||'';
  searchKeyConfigured=settings.hasKey===true;
  showSearchKeyState();
  syncSearchFields();
}
$('search-save').onclick=()=>action(async()=>{
  const provider=$('search-provider').value;
  await call('configureSearch',{config:{provider,endpoint:$('search-endpoint').value.trim(),key:$('search-key').value},clearKey:searchKeyReset});
  $('search-key').value='';searchKeyReset=false;
  await loadSearchSettings();
  $('search-result').textContent=provider?'已保存':'已改用内置来源';
});
async function saveConfig(){
  const config=providerConfig();
  if(!config.endpoint)throw new Error('请填写 API 地址');
  if(!config.model)throw new Error('请选择模型');
  const preset=selectedPreset();
  const needsKey=keyReset||!!preset&&preset.id!=='custom'&&!preset.local&&!credentialConfigured;
  if(needsKey&&!$('key').value.trim()){$('connection-details').open=true;showKeyState();throw new Error('请先配置 API Key');}
  await call('configure',{config,key:$('key').value});editingProvider=config.id;$('key').value='';
  await refresh();editProvider(state.providers?.find(provider=>provider.id===config.id)||config);
}
$('save-config').onclick=()=>action(async()=>{await saveConfig();$('notice').textContent='配置已保存并使用';});
$('remove-provider').onclick=()=>action(async()=>{
  if(!editingProvider)return;
  await call('removeProvider',{providerId:editingProvider});await refresh();
  editProvider(state.config.endpoint?state.config:null);
  $('notice').textContent='供应商配置和对应密钥已移除，已有插件不受影响';
});
$('test-config').onclick=()=>action(async()=>{
  if(!$('model').value.trim())throw new Error('请先选择或输入模型');
  await saveConfig();
  const started=Date.now();$('test-result').textContent='正在测试连接…';try{await call('testConnection');}catch(e){$('test-result').textContent='连接失败';throw e;}
  $('test-result').textContent=`连接正常 · ${Date.now()-started} ms`;
  $('provider-state').textContent='连接正常';$('provider-state').classList.add('active');
  $('notice').textContent='连接成功';
});
$('new-project').onclick=()=>{resetProjectView();creatingProject=true;selected=null;render();};
function opened(project){
  if(!project)return;
  resetProjectView();creatingProject=false;selected=project.id;$('requirement').value='';
}
async function create(withSample){
  const requirement=$('requirement').value.trim();
  if(!withSample&&!requirement)throw new Error('请先描述需要的插件，或附加一个样例文件');
  opened(await call('create',{requirement,withSample}));
}
async function createFromPath(path){
  opened(await call('createPath',{path,requirement:$('requirement').value.trim()}));
}
$('create-text').onclick=()=>action(()=>create(false));$('create-sample').onclick=()=>action(()=>create(true));
// Dropped files arrive from the host as paths: the sample stays where the user keeps it
// and only its path and extension are recorded. Contents are never read or transferred.
onDrop(paths=>{
  if(settingsPage||!paths?.length)return;
  if(paths.length!==1){error('请一次拖入一个样例文件');return;}
  void action(()=>createFromPath(paths[0]));
});
onDrag(state=>{if(settingsPage)return;document.body.classList.toggle('dragging',state==='enter');});
// A page that never receives a drop still has to keep a stray one from navigating to it.
document.addEventListener('dragover',event=>event.preventDefault());
document.addEventListener('drop',event=>event.preventDefault());
onContext(({page})=>{applyPage(page);if(page==='settings'&&state)void loadModelsForDraft();});
$('generate').onclick=()=>action(async()=>{
  resetProjectView();selectPane('progress');
  const p=current();
  if(!p.transcript?.some(turn=>turn.role==='user')&&!$('message').value.trim()&&!p.sample)
    throw new Error('请先描述需要的插件，或附加一个样例文件');
  await call('start',{id:selected,message:$('message').value.trim()});$('message').value='';
});
$('analyze').onclick=()=>action(async()=>{resetProjectView();await call('analyze',{id:selected,message:$('message').value.trim()});$('message').value='';});
$('cancel').onclick=()=>action(()=>call('cancel',{id:selected}));
$('select-sample').onclick=()=>action(async()=>{resetProjectView();await call('selectSample',{id:selected});});
$('install').onclick=()=>action(()=>call('install',{id:selected}));
$('restore').onclick=()=>action(async()=>{resetProjectView();await call('restore',{id:selected});});
$('export').onclick=()=>action(()=>call('export',{id:selected}));
$('open').onclick=()=>action(()=>call('openSample',{id:selected}));
$('delete').onclick=()=>action(()=>removeProject(selected));
$('preview').onclick=()=>action(async()=>{await call('openPreview',{id:selected});$('notice').textContent='已打开独立试预览窗口；看过后可以直接安装。';});
ready.then(()=>{
  // The host answered, so the page can stop the bootstrap's watchdog.
  globalThis.__emberBoot?.();
  return action(async()=>{
  applyPage(context().page);
  try{catalog=await call('catalog')||catalog;}catch{}populatePresets();
  await refresh();
  // Opening the workshop from a file already creates the project; show it instead of
  // the empty creator so the user lands on the task that file produced.
  if(!selected&&state.projects.length){selected=state.projects[0].id;creatingProject=false;}
  else if(!state.projects.length)creatingProject=true;
  render();
  editProvider(state.config.endpoint?state.config:null);
  try{await loadSearchSettings();}catch{}
  if(state.warnings?.length)$('notice').textContent=state.warnings.join('\n');
  });
}).catch(error);
setInterval(async()=>{if(polling)return;polling=true;try{await refresh();if(current())await refreshArtifacts();}catch(e){error(e);}finally{polling=false;}},2000);
