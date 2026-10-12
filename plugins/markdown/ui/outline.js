import { sidebar, postTo, onMessage, onSettings, configuration, onLocale } from './sdk.js';

export function outlineBatches(headings) {
  const result = [];
  for (let start = 0; start < headings.length; start += 64) result.push({ start, entries: headings.slice(start,start+64).map(item=>({title:item.title.slice(0,512),level:item.level})) });
  return result;
}

export function outlineSidebar(headings, {navigate, refresh, say}) {
  let open = configuration().showOutline !== false, preferred = open, active = -1, transfer = 0;
  const batches = outlineBatches(headings);
  const setOpen = async value => { open=value;await sidebar(value);refresh();if(value)void postTo("sidebar",{kind:"outline-ready"}).catch(()=>{}); };
  const unsubscribe = onMessage(async(message,from)=>{
    if(from!=='sidebar'||!message)return;
    if(message.kind==='outline-hello') {
      open=true;refresh();const current=++transfer;
      await postTo('sidebar',{kind:'outline-start',count:headings.length});
      for(const batch of batches) {if(current!==transfer)return;await postTo('sidebar',{kind:'outline-entries',...batch});}
      if(current===transfer)await postTo('sidebar',{kind:'outline-active',index:active});
    }
    if(message.kind==='outline-closed'){open=false;transfer++;refresh();}
    if(message.kind==='outline-navigate' && Number.isInteger(message.index) && headings[message.index])navigate(headings[message.index].line);
  });
  const settingsOff=onSettings(settings=>{
    const value=settings.showOutline!==false;if(value===preferred)return;preferred=value;void setOpen(value).catch(()=>{});
  });
  addEventListener('pagehide',()=>{transfer++;unsubscribe();settingsOff();},{once:true});
  if(open)void setOpen(true).catch(()=>{});
  return {
    changed(index){active=index;void postTo('sidebar',{kind:'outline-active',index}).catch(()=>{});},
    control:()=>({id:'outline',kind:'toggle',label:say('outline'),icon:'panel-left',active:open,run:()=>setOpen(!open)}),
  };
}

export function mountOutline(say) {
  document.body.replaceChildren();document.body.classList.add('outline-sidebar');
  const header=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');
  close.type='button';close.textContent='×';header.append(title,close);
  const list=document.createElement('nav'),spacer=document.createElement('div'),empty=document.createElement('p');
  list.id='outline';spacer.className='outline-spacer';list.append(spacer,empty);document.body.append(header,list);
  let entries=[],count=0,active=-1,frame,welcomed=false,asked=false;
  const rows=new Map(),height=32;
  const label=()=>{title.textContent=say('outline');close.title=say('closeOutline');list.setAttribute('aria-label',say('outline'));empty.textContent=say('empty');};label();
  const schedule=()=>{if(frame!==undefined)return;frame=requestAnimationFrame(()=>{frame=undefined;paint();});};
  function paint() {
    empty.hidden=count!==0;spacer.style.height=`${count*height}px`;
    const first=Math.max(0,Math.floor(list.scrollTop/height)-1),last=Math.min(count,Math.ceil((list.scrollTop+list.clientHeight)/height)+1);
    for(const [index,button] of rows)if(index<first||index>=last){button.remove();rows.delete(index);}
    for(let index=first;index<last;index++){
      const item=entries[index];if(!item)continue;
      let button=rows.get(index);
      if(!button){button=document.createElement('button');button.type='button';button.textContent=item.title;button.title=item.title;
        button.style.top=`${index*height}px`;button.style.paddingLeft=`${8+(item.level-1)*10}px`;
        button.onclick=()=>void postTo('view',{kind:'outline-navigate',index});rows.set(index,button);spacer.append(button);}
      button.classList.toggle('active',index===active);button.setAttribute('aria-current',index===active?'location':'false');
    }
  }
  const messageOff=onMessage((message,from)=>{
    if(from!=='view'||!message)return;
    if(message.kind==='outline-ready'){if(!welcomed&&!asked){asked=true;void postTo('view',{kind:'outline-hello'});}return;}
    if(message.kind==='outline-start'&&Number.isInteger(message.count)&&message.count>=0&&message.count<=100000){
      welcomed=true;count=message.count;entries=[];rows.clear();spacer.replaceChildren();schedule();
    }else if(message.kind==='outline-entries'&&Number.isInteger(message.start)&&message.start===entries.length&&Array.isArray(message.entries)&&message.entries.length<=64&&entries.length+message.entries.length<=count){
      if(message.entries.some(item=>!item||typeof item.title!=='string'||item.title.length>512||!Number.isInteger(item.level)||item.level<1||item.level>6))return;
      entries.push(...message.entries);schedule();
    }else if(message.kind==='outline-active'&&Number.isInteger(message.index)&&message.index>=-1&&message.index<count){
      if(active===message.index)return;active=message.index;
      const top=active*height;if(active>=0&&(top<list.scrollTop||top+height>list.scrollTop+list.clientHeight))list.scrollTop=Math.max(0,top-list.clientHeight/2);
      schedule();
    }
  });
  const localeOff=onLocale(label),observer=new ResizeObserver(schedule);observer.observe(list);
  list.addEventListener('scroll',schedule,{passive:true});
  close.onclick=async()=>{await postTo('view',{kind:'outline-closed'});await sidebar(false);};
  addEventListener('pagehide',()=>{messageOff();localeOff();observer.disconnect();if(frame!==undefined)cancelAnimationFrame(frame);},{once:true});
  void postTo('view',{kind:'outline-hello'});
}
