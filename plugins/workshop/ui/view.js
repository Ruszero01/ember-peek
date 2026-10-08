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
let modelLoadSequence=0, draftModels=[], lastSavedProvider='';
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
function markProviderDirty(){$('provider-state').textContent='未保存更改';$('provider-state').classList.remove('active');syncProviderDraft();scheduleProviderSave();}
function providerConfig(){
  const optional=id=>{const value=$(id).value.trim();return value===''?null:Number(value);};
  return {id:editingProvider,preset:$('preset').value,name:$('provider-name').value.trim(),endpoint:$('endpoint').value.trim(),model:draftModels[0]?.id||'',models:draftModels.map(m=>({...m})),maxTokens:null,contextWindow:null,temperature:optional('temperature'),timeoutSeconds:optional('timeout')};
}
async function loadModelsForDraft(){
  const endpoint=$('endpoint').value.trim();const preset=selectedPreset();const key=$('key').value.trim();
  const local=!!preset?.local||/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(endpoint);
  if(!endpoint){$('model-status').textContent='请先配置接口地址';return;}
  if(!local&&!credentialConfigured&&!key){$('model-status').textContent='请先配置 API Key';return;}
  const sequence=++modelLoadSequence;$('model').disabled=true;$('model-status').textContent='正在获取可用模型…';
  try{
    const models=await call('modelsDraft',{config:providerConfig(),key});
    if(sequence!==modelLoadSequence)return;
    for(const id of models)if(!draftModels.some(m=>m.id===id))draftModels.push({id,name:id});
    renderConfiguredModels();$('model-status').textContent=models.length?`已获取 ${models.length} 个模型`:'服务商没有返回模型';scheduleProviderSave();
  }catch(e){if(sequence===modelLoadSequence){$('model-status').textContent=`模型列表获取失败：${String(e)}`;}}
  finally{if(sequence===modelLoadSequence)$('model').disabled=false;}
}
function populateProviders(){
  const list=$('providers');list.replaceChildren();
  const providers=state.providers||[];
  $('providers-empty').hidden=!!providers.length||draftingProvider;
  if(draftingProvider){
    const draft=document.createElement('button');draft.type='button';draft.className='provider-item selected draft';
    const name=document.createElement('strong');name.textContent=$('provider-name').value.trim()||selectedPreset()?.name||'新供应商';
    draft.append(name);list.append(draft);
  }
  for(const provider of providers){
    const button=document.createElement('button');
    button.type='button';
    button.className=provider.id===editingProvider?'provider-item selected':'provider-item';
    button.disabled=busy;
    const name=document.createElement('strong');name.textContent=providerLabel(provider);
    button.append(name);
    button.onclick=()=>editProvider(provider);
    list.append(button);
  }
}
function editProvider(config){
  clearTimeout(providerSaveTimer);providerRevision++;
  draftingProvider=!config;
  editingProvider=config?.id||`provider-${crypto.randomUUID()}`;
  $('provider-title').textContent=config?providerLabel(config):'添加供应商';
  $('preset').value=config?.preset||'custom';
  lastPresetName=selectedPreset()?.name||'';
  $('provider-name').value=config?.name||'';
  $('endpoint').value=config?.endpoint||'';
  draftModels=(config?.models?.length?config.models:config?.model?[{id:config.model,name:config.model}]:[]).map(m=>({...m}));
  $('model').value='';$('model-name').value='';renderConfiguredModels();
  $('temperature').value=config?.temperature??'';
  $('timeout').value=config?.timeoutSeconds??'';
  $('key').value='';$('key').type='password';$('reveal-key').textContent='显示';$('test-result').textContent='';
  $('remove-provider').disabled=busy||draftingProvider;
  credentialConfigured=!!editingProvider&&!!state.keys?.[editingProvider];keyReset=false;showKeyState();

  $('provider-state').textContent=config?'已配置':'未保存';
  $('provider-state').classList.toggle('active',!!config);
  $('connection-details').open=!config||!config.endpoint;
  $('advanced').open=false;
  updateConnectionSummary(config);lastSavedProvider=JSON.stringify(providerConfig());
  populateProviders();

}
$('new-provider').onclick=()=>{editProvider(null);$('notice').textContent='';};
$('preset').onchange=()=>{
  const preset=selectedPreset();
  if(!preset)return;
  const name=$('provider-name').value.trim();
  $('endpoint').value=preset.endpoint||'';
  if(draftingProvider||!name||name===lastPresetName)$('provider-name').value=preset.name;
  lastPresetName=preset.name;
  draftModels=[];$('model').value='';$('model-name').value='';renderConfiguredModels();
  credentialConfigured=false;keyReset=false;$('key').value='';showKeyState();
  $('connection-details').open=true;
  markProviderDirty();

  $('notice').textContent=preset.endpoint?`已填入 ${preset.name} 的接口地址，请点击获取模型列表`:'请填写接口地址';
};
$('endpoint').oninput=()=>{credentialConfigured=false;keyReset=false;showKeyState();markProviderDirty();};

$('key').oninput=()=>{updateConnectionSummary();markProviderDirty();};

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
const TOOL_ICONS={read_file:'file-text',read_attachment:'paperclip',write_file:'file-pen',edit_file:'pencil',validate:'shield-check',preview:'play',list_icons:'shapes',add_dependency:'package-plus',search_web:'search',read_docs:'book-open',read_page:'globe'};
const TOOL_VERBS={read_file:'读取',read_attachment:'读取附件',write_file:'写入',edit_file:'修改',validate:'校验',preview:'试运行',list_icons:'查询图标',add_dependency:'取用库',search_web:'联网搜索',read_docs:'查文档',read_page:'读取网页'};
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
/* ---------- files and diagnostics ----------
   The conversation already carries every execution step. The side rail is therefore the
   task's compact source/generated-file inventory, with failures left in their old place. */
let artifactFiles=[];
let fileSignature='';
let diagnosticSignature='';
function fileExtension(name){return (String(name||'').split('.').pop()||'file').slice(0,4);}
function railFile(file){
  const row=document.createElement('div');row.className='rail-file';row.title=file.name;
  const icon=document.createElement('span');icon.className='rail-file-icon';icon.textContent=fileExtension(file.name);
  const copy=document.createElement('span');copy.className='rail-file-copy';
  const name=document.createElement('span');name.className='rail-file-name';name.textContent=file.name;
  const meta=document.createElement('span');meta.className='rail-file-meta';meta.textContent=[file.role,formatBytes(file.size)].filter(Boolean).join(' · ');
  copy.append(name,meta);row.append(icon,copy);return row;
}
function emptyFileRow(text){const row=document.createElement('p');row.className='rail-empty';row.textContent=text;return row;}
function renderFiles(p){
  const sources=[];
  if(p.sample)sources.push({name:baseName(p.sample),size:p.sampleSize,role:'样例'});
  for(const file of p.attachments||[])sources.push({name:file.name||baseName(file.path),size:file.size,role:file.image?'图片':'附件'});
  const signature=JSON.stringify([p.id,sources,artifactFiles.map(file=>[file.name,file.size]),running(p)]);
  if(signature===fileSignature)return;
  fileSignature=signature;
  $('source-files').replaceChildren(...(sources.length?sources.map(railFile):[emptyFileRow('暂无来源文件')]));
  $('generated-files').replaceChildren(...(artifactFiles.length?artifactFiles.map(file=>railFile({...file,role:'生成'})):[emptyFileRow(running(p)?'正在生成文件…':'暂未生成文件')]));
  $('file-metrics').textContent=artifactFiles.length?`${artifactFiles.length} 个`:'';
}
function renderDiagnostics(p){
  const signature=JSON.stringify([p.runtimeLogs,p.error,state.sdkFingerprint,build(p)?.sdkFingerprint]);
  if(signature===diagnosticSignature)return;
  diagnosticSignature=signature;
  // Everything that went wrong stays here: the task's own failure, the note that the
  // host SDK changed, and whatever the plugin's document logged while it ran.
  const sdkChanged=!!(build(p)&&build(p).sdkFingerprint!==state.sdkFingerprint);
  const message=sdkChanged?'宿主 SDK 已更新，请重新生成并试预览。已安装版本不受影响。':(p.error?diagnosticText(p.error):'');
  $('diagnostic').textContent=message;
  $('error-details').hidden=!p.error;
  $('error-raw').textContent=p.error||'';
  const diagnostics=p.runtimeLogs||[];
  $('runtime-log-lines').replaceChildren(...diagnostics.map(line=>{const row=document.createElement('div');row.textContent=line;return row;}));
  $('diagnostics').hidden=!message&&!diagnostics.length;
}
let artifactSignature='';
async function refreshArtifacts(){
  if(!selected)return;
  const id=selected;const files=await call('artifacts',{id});if(selected!==id)return;
  const signature=JSON.stringify(files);if(signature===artifactSignature)return;artifactSignature=signature;
  artifactFiles=files;
  const opened=new Set([...$('artifact-files').querySelectorAll('details[open]')].map(item=>item.dataset.name));
  $('artifact-files').replaceChildren(...files.map(file=>{const details=document.createElement('details');details.dataset.name=file.name;details.open=opened.has(file.name);const title=document.createElement('summary');title.textContent=`${file.name} · ${formatBytes(file.size)}`;const pre=document.createElement('pre');pre.textContent=file.content;details.append(title,pre);return details;}));
  const p=current();if(p)renderFiles(p);
}
$('inspect-artifacts').onclick=()=>action(refreshArtifacts);
function resetProjectView(){artifactSignature='';artifactFiles=[];transcriptSignature='';fileSignature='';diagnosticSignature='';$('artifact-files').replaceChildren();}
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
    button.disabled=busy;
    button.replaceChildren(nameNode(p.name));button.title=p.name;
    button.onclick=()=>{resetProjectView();creatingProject=false;selected=p.id;render();};
    row.append(button);
    const remove=document.createElement('button');
    remove.type='button';remove.className='project-remove';remove.textContent='×';remove.title='删除任务';
    remove.disabled=busy||running(p);
    remove.setAttribute('aria-label',`删除任务：${p.name}`);
    remove.onclick=()=>{void action(()=>removeProject(p.id));};
    row.append(remove);
    list.append(row);
  }
}
function render(){
  renderModelPickers();
  renderProjectList();
  populateProviders();
  // Only controls that start another host operation are locked. Blanket-disabling every
  // button made the creator and settings stay grey when a bootstrap request was interrupted.
  for(const id of ['new-project','generate','create-sample','message-attach','new-provider','test-config'])$(id).disabled=busy;
  $('remove-provider').disabled=busy||draftingProvider;
  const p=current();$('creator').hidden=!!p;$('project').hidden=!p;
  const composer=$('chat-composer'),composerParent=p?$('project-column'):$('creator');
  // Re-appending a focused subtree detaches it and blurs the input in WebView2.
  if(composer.parentElement!==composerParent)composerParent.append(composer);
  $('message').placeholder=p?'描述要调整的地方，或补充需求…':'描述插件需求，例如支持的格式、预览效果与交互…';
  if(!p){
    $('generate').textContent='开始对话 ↑';$('generate').classList.add('primary');
    $('cancel').hidden=true;$('preview').hidden=true;$('install').hidden=true;
    return;
  }
  $('project-name').replaceChildren(nameNode(p.name));$('project-flag').hidden=!p.installedVersion;
  // The agent runs the plugin itself now, so say whose eyes approved this build.
  $('self-check').hidden=false;$('self-check').textContent=p.tested?(p.selfChecked?'模型自检通过':'试预览通过'):labels[p.status]||p.status;
  $('status').textContent='';
  $('generate').textContent=['failed','cancelled','interrupted'].includes(p.status)?'继续生成':p.status==='previewFailed'?'修复预览问题':p.version?'重新生成':'生成插件';
  const hasSample=!!p.sample;
  $('sample').hidden=hasSample;
  $('sample').textContent=hasSample?'':'这个任务没有样例文件，模型会按需求决定插件支持的扩展名。';
  renderConversation(p);renderFiles(p);renderDiagnostics(p);
  // The gates below care about the same fact the diagnostics report: a build made against
  // an older SDK cannot be installed or shared.
  const sdkChanged=!!(build(p)&&build(p).sdkFingerprint!==state.sdkFingerprint);
  $('select-sample').disabled=busy||running(p);$('add-files').disabled=busy||running(p);$('message-attach').disabled=busy||running(p);$('inspect-artifacts').disabled=busy;
  $('restore').disabled=busy||running(p)||!p.builds?.some(b=>b.verified&&b.version<p.version);
  $('cancel').hidden=!running(p);$('preview').hidden=!p.version;$('install').hidden=!p.tested;
  $('generate').classList.toggle('primary',!p.version||p.status==='previewFailed');
  $('generate').disabled=busy||running(p);$('cancel').disabled=busy||!running(p);
  $('preview').disabled=busy||running(p)||!p.version||!p.sample||sdkChanged;
  $('install').disabled=busy||!p.tested||running(p)||sdkChanged;$('export').disabled=busy||!p.tested||running(p)||sdkChanged;$('open').disabled=busy||!p.installedVersion||!p.sample;
  $('delete').disabled=busy||running(p);
}
async function refresh(){state=await call('state',{}, {timeoutMs:15000});render();}
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
let searchKeyConfigured=false, searchKeyReset=false, savedSearchProvider='', savedSearchHasKey=false;
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
    : searchKeyReset&&provider==='tavily'
      ? '请输入新的密钥（必填）'
      : provider==='tavily'
        ? '在 Tavily 控制台创建，必填'
        : '实例需要鉴权时填，一般留空';
  $('search-state').textContent=!provider?'使用内置来源':provider!==savedSearchProvider?'未保存更改':provider==='searxng'&&$('search-endpoint').value.trim()||searchKeyConfigured?'已配置':'需要配置';
}
$('search-provider').onchange=()=>{
  searchKeyConfigured=$('search-provider').value===savedSearchProvider&&savedSearchHasKey;
  searchKeyReset=$('search-provider').value!==savedSearchProvider;
  $('search-key').value='';showSearchKeyState();syncSearchFields();scheduleSearchSave();
};
$('search-reveal-key').onclick=()=>{const hidden=$('search-key').type==='password';$('search-key').type=hidden?'text':'password';$('search-reveal-key').textContent=hidden?'隐藏':'显示';$('search-reveal-key').setAttribute('aria-label',hidden?'隐藏密钥':'显示密钥');};
$('search-reset-key').onclick=()=>{searchKeyReset=true;searchKeyConfigured=false;showSearchKeyState();$('search-key').focus?.();};
async function loadSearchSettings(){
  const settings=await call('searchSettings');
  $('search-provider').value=settings.provider||'';
  $('search-endpoint').value=settings.endpoint||'';
  savedSearchProvider=settings.provider||'';savedSearchHasKey=settings.hasKey===true;
  searchKeyConfigured=savedSearchHasKey;
  showSearchKeyState();
  syncSearchFields();
}
$('remove-provider').onclick=()=>action(async()=>{
  clearTimeout(providerSaveTimer);providerRevision++;
  if(!editingProvider)return;
  await call('removeProvider',{providerId:editingProvider});await refresh();
  editProvider(state.config.endpoint?state.config:null);
  $('notice').textContent='供应商配置和对应密钥已移除，已有插件不受影响';
});
$('test-config').onclick=()=>action(async()=>{

  const config=providerConfig();if(!config.model)throw new Error('请先添加模型');
  const started=Date.now();$('test-result').textContent='正在测试连接…';try{await call('testProvider',{config,key:$('key').value});}catch(e){$('test-result').textContent='连接失败';throw e;}
  $('test-result').textContent=`连接正常 · ${Date.now()-started} ms`;
  $('provider-state').textContent='连接正常';$('provider-state').classList.add('active');
  $('notice').textContent='连接成功';
});
$('new-project').onclick=()=>{resetProjectView();creatingProject=true;selected=null;render();};
function opened(project){
  if(!project)return;
  resetProjectView();creatingProject=false;selected=project.id;$('message').value='';
}
async function create(withSample){
  const requirement=$('message').value.trim();
  if(!withSample&&!requirement)throw new Error('请先描述需要的插件，或附加一个样例文件');
  const project=await call('create',{requirement,withSample});
  opened(project);
  if(project&&!withSample)await call('start',{id:project.id,message:''});
}
async function createFromPath(path){
  opened(await call('createPath',{path,requirement:$('message').value.trim()}));
}
$('create-sample').onclick=()=>action(()=>create(true));
// Dropped files arrive from the host as paths. On the creator the first path is the sample;
// inside a task they become extra conversation sources and remain where the user keeps them.
onDrop(paths=>{
  if(settingsPage||!paths?.length)return;
  if(current()){
    void action(()=>call('addPaths',{id:selected,paths}));
    return;
  }
  if(paths.length!==1){error('请一次拖入一个样例文件');return;}
  void action(()=>createFromPath(paths[0]));
});
onDrag(state=>{if(settingsPage)return;document.body.classList.toggle('dragging',state==='enter');});
// A page that never receives a drop still has to keep a stray one from navigating to it.
document.addEventListener('dragover',event=>event.preventDefault());
document.addEventListener('drop',event=>event.preventDefault());
onContext(({page})=>{applyPage(page);});
$('generate').onclick=()=>action(async()=>{
  resetProjectView();selectPane('progress');
  const p=current();
  if(!p){await create(false);return;}
  if(!p.transcript?.some(turn=>turn.role==='user')&&!$('message').value.trim()&&!p.sample)
    throw new Error('请先描述需要的插件，或附加一个样例文件');
  await call('start',{id:selected,message:$('message').value.trim()});$('message').value='';
});
$('cancel').onclick=()=>action(()=>call('cancel',{id:selected}));
$('select-sample').onclick=()=>action(async()=>{resetProjectView();await call('selectSample',{id:selected});});
async function addAttachments(){await call('addAttachments',{id:selected});}
$('add-files').onclick=()=>action(addAttachments);
$('message-attach').onclick=()=>action(()=>current()?addAttachments():create(true));
$('install').onclick=()=>action(()=>call('install',{id:selected}));
$('restore').onclick=()=>action(async()=>{resetProjectView();await call('restore',{id:selected});});
$('export').onclick=()=>action(()=>call('export',{id:selected}));
$('open').onclick=()=>action(()=>call('openSample',{id:selected}));
$('delete').onclick=()=>action(()=>removeProject(selected));
$('preview').onclick=()=>action(async()=>{await call('openPreview',{id:selected});$('notice').textContent='已打开独立试预览窗口；看过后可以直接安装。';});
ready.then(async()=>{
  // The host answered, so the page can stop the bootstrap's watchdog.
  globalThis.__emberBoot?.();
  applyPage(context().page);
  try{
    try{catalog=await call('catalog',{}, {timeoutMs:15000})||catalog;}catch{}populatePresets();
    await refresh();
    // Opening the workshop from a file already creates the project; show it instead of
    // the empty creator so the user lands on the task that file produced.
    if(!selected&&state.projects.length){selected=state.projects[0].id;creatingProject=false;}
    else if(!state.projects.length)creatingProject=true;
    render();
    editProvider(state.config.endpoint?state.config:null);
    try{await loadSearchSettings();}catch{}
    if(state.warnings?.length)$('notice').textContent=state.warnings.join('\n');
  }catch(e){error(e);}
}).catch(error);
setInterval(async()=>{if(polling)return;polling=true;try{await refresh();if(current())await refreshArtifacts();}catch(e){error(e);}finally{polling=false;}},2000);

// Serialize autosaves and ignore completion feedback for a draft changed in flight.
let providerSaveTimer, searchSaveTimer, providerSaving=false, searchSaving=false;
let providerRevision=0, searchRevision=0;
function scheduleProviderSave(){
  const revision=++providerRevision;clearTimeout(providerSaveTimer);
  providerSaveTimer=setTimeout(async()=>{
    if(providerSaving){scheduleProviderSave();return;}
    const config=providerConfig(), key=$('key').value.trim(), preset=selectedPreset();
    const validUrl=(()=>{try{return ['http:','https:'].includes(new URL(config.endpoint).protocol);}catch{return false;}})();
    if(!validUrl||(keyReset||preset&&preset.id!=='custom'&&!preset.local&&!credentialConfigured)&&!key){$('provider-state').textContent='待填写完整';return;}
    if(config.temperature!==null&&(!Number.isFinite(config.temperature)||config.temperature<0||config.temperature>2)||config.timeoutSeconds!==null&&(!Number.isInteger(config.timeoutSeconds)||config.timeoutSeconds<10||config.timeoutSeconds>900)){$('provider-state').textContent='请检查高级选项';return;}
    if(JSON.stringify(config)===lastSavedProvider&&!key){$('provider-state').textContent='已配置';return;}
    providerSaving=true;$('provider-state').textContent='正在保存…';
    try{
      await call('saveProvider',{config,key});await refresh();
      if(revision===providerRevision&&editingProvider===config.id){
        lastSavedProvider=JSON.stringify(config);draftingProvider=false;if(key){credentialConfigured=true;keyReset=false;$('key').value='';showKeyState();}
        $('provider-state').textContent='已自动保存';$('provider-state').classList.add('active');populateProviders();
      }
    }catch(e){if(revision===providerRevision){$('provider-state').textContent='保存失败';error(e);}}
    finally{providerSaving=false;}
  },600);
}
function scheduleSearchSave(){
  const revision=++searchRevision;clearTimeout(searchSaveTimer);
  searchSaveTimer=setTimeout(async()=>{
    if(searchSaving){scheduleSearchSave();return;}
    const provider=$('search-provider').value, endpoint=$('search-endpoint').value.trim(), key=$('search-key').value.trim(), clearKey=searchKeyReset;
    if(provider==='tavily'&&!searchKeyConfigured&&!key){$('search-state').textContent='待填写密钥';return;}
    if(provider==='searxng'){try{if(!['http:','https:'].includes(new URL(endpoint).protocol))throw Error();}catch{$('search-state').textContent='待填写有效地址';return;}}
    searchSaving=true;$('search-state').textContent='正在保存…';
    try{
      await call('configureSearch',{config:{provider,endpoint:provider==='searxng'?endpoint:'',key},clearKey});
      if(revision===searchRevision){savedSearchProvider=provider;savedSearchHasKey=!!key||searchKeyConfigured&&!clearKey;searchKeyConfigured=savedSearchHasKey;searchKeyReset=false;$('search-key').value='';showSearchKeyState();syncSearchFields();$('search-state').textContent='已自动保存';}
    }catch(e){if(revision===searchRevision){$('search-state').textContent='保存失败';error(e);}}
    finally{searchSaving=false;}
  },600);
}
$('search-endpoint').oninput=scheduleSearchSave;
$('search-key').oninput=scheduleSearchSave;
function renderConfiguredModels(){
  const list=$('configured-models');list.replaceChildren();
  for(const model of draftModels){
    const row=document.createElement('div');row.className='configured-model-row';
    const edit=document.createElement('button');edit.type='button';edit.textContent=model.name||model.id;edit.title=model.id;
    edit.onclick=()=>{$('model').value=model.id;$('model-name').value=model.name;};
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`删除模型 ${model.name||model.id}`);
    remove.onclick=()=>{draftModels=draftModels.filter(m=>m.id!==model.id);renderConfiguredModels();markProviderDirty();};row.append(edit,remove);list.append(row);
  }
  $('model-status').textContent=draftModels.length?`${draftModels.length} 个已配置模型`:'尚未添加模型，可手动获取或添加';
}
$('fetch-models').onclick=()=>action(()=>loadModelsForDraft());
$('add-model').onclick=()=>{
  const id=$('model').value.trim(),name=$('model-name').value.trim()||id;
  if(!id){error('请输入模型 ID');return;}
  const existing=draftModels.find(m=>m.id===id);if(existing)existing.name=name;else draftModels.push({id,name});
  $('model').value='';$('model-name').value='';renderConfiguredModels();markProviderDirty();
};
function renderModelPickers(){
  for(const id of ['project-chat-model']){
    const picker=$(id);const options=[];
    for(const provider of state.providers||[]){
      const models=provider.models?.length?provider.models:provider.model?[{id:provider.model,name:provider.model}]:[];
      for(const model of models)options.push(new Option(`${providerLabel(provider)} · ${model.name||model.id}`,JSON.stringify([provider.id,model.id])));
    }
    const signature=JSON.stringify(options.map(option=>[option.text,option.value]));
    if(picker.modelSignature!==signature){picker.replaceChildren(new Option(options.length?'选择模型':'请先配置模型',''),...options);picker.modelSignature=signature;}
    picker.value=JSON.stringify([state.config?.id,state.config?.model]);picker.disabled=busy||state.projects?.some(p=>running(p));
  }
}
for(const id of ['project-chat-model'])$(id).onchange=()=>action(async()=>{
  if(!$(id).value)return;const [providerId,model]=JSON.parse($(id).value);
  await call('selectModel',{providerId,model});
});
document.addEventListener('pointerdown',event=>{
  const menu=$('more-actions');
  if(menu.open&&!menu.contains(event.target))menu.open=false;
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')$('more-actions').open=false;
});
$('more-actions').onclick=event=>{
  if(event.target.closest('button'))$('more-actions').open=false;
};
