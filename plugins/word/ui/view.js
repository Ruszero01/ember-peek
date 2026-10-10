import { ready, read, controls, status, presented, shortcuts, translate, onLocale } from './sdk.js';
import { readDocument, pageIndex, zoomFactor, lockDocumentLinks } from './sdk-document.js';
import { renderAsync } from './vendor/docx.js';
const { data } = await ready;
const viewport = document.querySelector('#viewport'), content = document.querySelector('#content');
const say = translate({
  'zh-CN': { loading:'正在加载 Word…', previous:'上一页', next:'下一页', page:'页码', zoom:'缩放比例', fit:'适应宽度', info:'第 {page} / {count} 页 · {zoom}%' },
  en: { loading:'Loading Word…', previous:'Previous page', next:'Next page', page:'Page', zoom:'Zoom', fit:'Fit width', info:'Page {page} / {count} · {zoom}%' },
});
let pages=[], page=0, zoom=1, fitting=true, scrollFrame;
lockDocumentLinks(content);
function publish() {
  controls([
    {id:'previous',kind:'button',label:say('previous'),icon:'chevron-left',run:()=>navigate(page)},
    ...(pages.length>1?[{id:'page',kind:'scrub',label:say('page'),value:page+1,min:1,max:pages.length,direction:'down',run:navigate}]:[]),
    {id:'next',kind:'button',label:say('next'),icon:'chevron-right',run:()=>navigate(page+2)},
    {id:'zoom',kind:'scrub',label:say('zoom'),value:zoom*100,min:Math.min(10,zoom*100),max:400,suffix:'%',run:value=>{fitting=false;setZoom(zoomFactor(value));}},
    {id:'fit',kind:'button',label:say('fit'),icon:'maximize-2',run:fit},
  ]);
  status(say('info',{page:page+1,count:pages.length,zoom:Math.round(zoom*100)}));
}
function navigate(value) {page=pageIndex(value,pages.length);pages[page].scrollIntoView({block:'start'});publish();}
function setZoom(value) {zoom=value;content.style.zoom=String(zoom);publish();}
function fit() {
  fitting=true;
  const width=Math.max(...pages.map(p=>parseFloat(getComputedStyle(p).width)||816));
  setZoom(Math.min(1,Math.max(1,viewport.clientWidth-64)/width));
}
try {
  status(say('loading'));
  await renderAsync(await readDocument(read,data.size),content,content,{inWrapper:true,breakPages:true,ignoreLastRenderedPageBreak:false,
    renderAltChunks:false,renderComments:false,renderChanges:false,useBase64URL:true});
  pages=[...content.querySelectorAll('section.docx')];
  if(!pages.length)throw new Error('Document contains no renderable pages');
  fit();onLocale(publish);
  addEventListener('resize',()=>{if(fitting)fit();});
  viewport.addEventListener('scroll',()=>{
    if(scrollFrame!==undefined)return;
    scrollFrame=requestAnimationFrame(()=>{scrollFrame=undefined;let nearest=0,distance=Infinity;
      for(let i=0;i<pages.length;i++){const d=Math.abs(pages[i].getBoundingClientRect().top-viewport.getBoundingClientRect().top);if(d<distance){distance=d;nearest=i;}}
      if(page!==nearest){page=nearest;publish();}
    });
  });
  viewport.addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();fitting=false;setZoom(zoomFactor(zoom*100*(event.deltaY<0?1.1:1/1.1)));},{passive:false});
  await shortcuts([{id:'previous',key:'PageUp',run:()=>navigate(page)},{id:'next',key:'PageDown',run:()=>navigate(page+2)}]);
  await presented();
}catch(error){const message=String(error?.message??error);status(message);await presented(message);}
