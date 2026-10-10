import { ready, read, controls, status, presented, shortcuts, translate, onLocale } from './sdk.js';
import { readDocument, pageIndex, zoomFactor, fitDocument, lockDocumentLinks } from './sdk-document.js';
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from './vendor/pptx.js';
const { data } = await ready;
const viewport=document.querySelector('#viewport'),content=document.querySelector('#content');lockDocumentLinks(content);
const say=translate({
  'zh-CN':{loading:'正在加载 PowerPoint…',previous:'上一张',next:'下一张',page:'幻灯片',zoom:'缩放比例',fit:'适应窗口',info:'第 {page} / {count} 张 · {zoom}%'},
  en:{loading:'Loading PowerPoint…',previous:'Previous slide',next:'Next slide',page:'Slide',zoom:'Zoom',fit:'Fit window',info:'Slide {page} / {count} · {zoom}%'},
});
let viewer, page=0, fitting=true, zoom=1, queue=Promise.resolve(), closed=false;
function publish(){if(!viewer)return;
  controls([
    {id:'previous',kind:'button',label:say('previous'),icon:'chevron-left',run:()=>navigate(page)},
    ...(viewer.slideCount>1?[{id:'page',kind:'scrub',label:say('page'),value:page+1,min:1,max:viewer.slideCount,direction:'down',run:navigate}]:[]),
    {id:'next',kind:'button',label:say('next'),icon:'chevron-right',run:()=>navigate(page+2)},
    {id:'zoom',kind:'scrub',label:say('zoom'),value:zoom*100,min:10,max:400,suffix:'%',run:value=>schedule(async()=>{fitting=false;zoom=zoomFactor(value);await applyZoom();publish();})},
    {id:'fit',kind:'button',label:say('fit'),icon:'maximize-2',run:()=>schedule(async()=>{fitting=true;await fit();})},
  ]);status(say('info',{page:page+1,count:viewer.slideCount,zoom:Math.round(zoom*100)}));
}
async function applyZoom(){content.style.width=`${viewer.slideWidth*zoom}px`;content.style.height=`${viewer.slideHeight*zoom}px`;await viewer.setZoom(zoom*100);}
async function fit(){const style=getComputedStyle(viewport);const width=viewport.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);const height=viewport.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);zoom=fitDocument(width,height,viewer.slideWidth,viewer.slideHeight);await applyZoom();publish();}
function schedule(work){queue=queue.then(()=>{if(!closed)return work();}).catch(error=>status(String(error?.message??error)));return queue;}
function navigate(value){const next=pageIndex(value,viewer.slideCount);return schedule(async()=>{page=next;await viewer.renderSlide(page);publish();});}
try{
  status(say('loading'));
  viewer=await PptxViewer.open(await readDocument(read,data.size),content,{renderMode:'slide',fitMode:'none',lazyMedia:true,lazySlides:true,pdfjs:false,zipLimits:RECOMMENDED_ZIP_LIMITS});
  if(!viewer.slideCount)throw new Error('Presentation contains no slides');
  await fit();onLocale(publish);
  addEventListener('resize',()=>{if(fitting)void schedule(fit);});
  await shortcuts([{id:'previous',key:'ArrowLeft',run:()=>navigate(page)},{id:'next',key:'ArrowRight',run:()=>navigate(page+2)},
    {id:'previous-page',key:'PageUp',run:()=>navigate(page)},{id:'next-page',key:'PageDown',run:()=>navigate(page+2)}]);
  addEventListener('pagehide',()=>{closed=true;viewer?.destroy();},{once:true});
  await presented();
}catch(error){const message=String(error?.message??error);status(message);await presented(message);}
