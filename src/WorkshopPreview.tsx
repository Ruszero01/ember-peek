import { useCallback, useEffect, useRef, useState } from "react";
import { call, viewUrl } from "./bridge";
import { useT } from "./i18n";
import { pluginIcon } from "./pluginIcons";
import { validateDialog, validateWorkshopControls } from "./protocol.mjs";
import type { PluginDialogRequest } from "./protocol.mjs";
import { PluginDialog } from "./PluginDialog";
import { ScrubControl } from "./ScrubControl";
import type { Control } from "./types";

type Preview = {version:number; token:string; file:{name:string;size:number}};
export function WorkshopPreview({project,tool}:{project:string;tool:string}) {
 const t=useT();
 const mount=useRef<HTMLDivElement>(null);
 const [status,setStatus]=useState('正在加载预览…');
 const [failed,setFailed]=useState(false);
 const [controls,setControls]=useState<Control[]>([]);
 const [scrubbing,setScrubbing]=useState(false);
 const port=useRef<MessagePort|null>(null);
 const dialogQueue=useRef<{request:PluginDialogRequest;resolve:(value:string|null)=>void}[]>([]);
 const dialogActive=useRef<{request:PluginDialogRequest;resolve:(value:string|null)=>void}|null>(null);
 const [dialog,setDialog]=useState<{request:PluginDialogRequest;resolve:(value:string|null)=>void}|null>(null);
 const ask=useCallback((request:PluginDialogRequest)=>new Promise<string|null>(resolve=>{const next={request,resolve};if(dialogActive.current)dialogQueue.current.push(next);else{dialogActive.current=next;setDialog(next);}}),[]);
 const answer=useCallback((value:string|null)=>{const current=dialogActive.current;if(!current)return;current.resolve(value);const next=dialogQueue.current.shift()||null;dialogActive.current=next;setDialog(next);},[]);
 useEffect(()=>{
  let disposed=false;let timer:ReturnType<typeof setTimeout>;let frame:HTMLIFrameElement;
  const invoke=<T,>(method:string,params:Record<string,unknown>={})=>call<T>('tool_call',{id:tool,method,params:{id:project,...params}});
  let saved:Record<string,unknown>={};
  try{saved=JSON.parse(localStorage.getItem('ember.settings')||'{}');}catch{}
  document.documentElement.dataset.theme=saved.theme==='light'||(saved.theme!=='dark'&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';
  const css=getComputedStyle(document.documentElement);const theme=Object.fromEntries(['bg','text','muted','accent','border','color-scheme'].map(key=>[key,css.getPropertyValue('--'+key).trim()]));theme.surface=css.getPropertyValue('--card').trim();
  void invoke<Preview>('preview').then(p=>{
   if(disposed)return;
   // The page reports its own console and uncaught errors; the verdict carries them so a
   // trial run can explain why a plugin that threw before presenting still failed.
   let diagnostics:{level:string;text:string}[]=[];
   const verdict=async(error:string|null)=>{clearTimeout(timer);await invoke('presented',{version:p.version,token:p.token,error,logs:diagnostics.map(item=>`${item.level}: ${item.text}`)});if(!disposed){setFailed(!!error);setStatus(error?`预览失败：${error}`:'预览通过，可以返回工坊安装');}};
   frame=document.createElement('iframe');frame.title=p.file.name;frame.setAttribute('sandbox','allow-scripts');
   frame.onload=()=>{
    if(disposed)return;port.current?.close();const channel=new MessageChannel();port.current=channel.port1;let active=0;
    channel.port1.onmessage=async({data:m})=>{
     if(disposed)return;
     if(m?.type==='connected'){channel.port1.postMessage({type:'init',session:project,role:'view',data:{},file:p.file,settings:{},theme,locale:saved.locale==='en'?'en':'zh-CN'});return;}
     if(m?.type==='controls'){
      try{setControls(validateWorkshopControls(m.items,t));}
      catch(error){setControls([]);void verdict(String(error)).catch(e=>setStatus(String(e)));}
      return;
     }
     if(m?.type==='diagnostics'){if(Array.isArray(m.items))diagnostics=m.items.slice(0,20);return;}
     if(m?.type==='status'){if(m.error)void verdict(String(m.error)).catch(e=>setStatus(String(e)));else if(typeof m.text==='string')setStatus(m.text);return;}
     if(m?.type!=='request'||!Number.isSafeInteger(m.id))return;
     if(active>=8){channel.port1.postMessage({type:'reply',id:m.id,error:'Too many requests'});return;}active++;
     try{
      let value;
      if(m.method==='read')value=await invoke('readSample',{offset:m.params?.offset,length:m.params?.length});
      else if(m.method==='presented'){await verdict(m.params?.error?String(m.params.error):null);value=null;}
      else if(m.method==='icons')value=await invoke('icons',m.params);
      else if(m.method==='confirm')value=await ask(validateDialog(m.params,t));
      else throw Error('预览不支持该接口：'+m.method);
      channel.port1.postMessage({type:'reply',id:m.id,value});
     }catch(e){channel.port1.postMessage({type:'reply',id:m.id,error:String(e)});}finally{active--;}
    };
    frame.contentWindow?.postMessage({type:'ember:connect'},'*',[channel.port2]);
   };
   frame.src=viewUrl(`@workshop-${project}`,'ui/index.html')+`?v=${p.version}`;mount.current?.replaceChildren(frame);
   timer=setTimeout(()=>void verdict('初始化超时，请返回工坊修复后重试').catch(e=>setStatus(String(e))),30000);
  }).catch(e=>{if(!disposed){setFailed(true);setStatus(String(e));}});
  return()=>{disposed=true;clearTimeout(timer);port.current?.close();frame?.remove();};
 },[ask,project,t,tool]);
 const send=(id:string,value?:number)=>port.current?.postMessage({type:'action',id,value});
 return <><main className="workshop-preview-window"><header><strong>插件试预览</strong><span className={failed?'warning':''} role="status">{status}</span></header><div className="workshop-preview-canvas" ref={mount}/><footer className="toolbar-actions workshop-preview-controls">{controls.map(control=>{
  if(control.kind==='scrub')return <ScrubControl key={control.id} control={control} active={!scrubbing} onActiveChange={setScrubbing} onChange={value=>send(control.id,value)}/>;
  const Icon=pluginIcon(control.icon||'sliders-horizontal');
  return <button key={control.id} title={control.label} aria-label={control.label} aria-pressed={control.kind==='toggle'?Boolean(control.active):undefined} className={control.kind==='toggle'&&control.active?'on':''} onClick={()=>send(control.id)}><Icon size={18}/></button>;
 })}</footer></main>{dialog&&<PluginDialog request={dialog.request} onResolve={answer}/>}</>;
}
