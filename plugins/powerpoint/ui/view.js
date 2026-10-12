import { ready, read, status, presented, translate } from './sdk.js';
import { readDocument, lockDocumentLinks } from './sdk-document.js';
import { renderTarget } from './render-target.js';
import { pagedDocument } from './sdk-paged-document.js';
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from './vendor/pptx.js';
import { mountPageSidebar, pageSidebar, documentThumbnail } from './sdk-page-sidebar.js';
const { data, role } = await ready;
if (role === 'sidebar') await mountPageSidebar();
else {
  const viewport=document.querySelector('#viewport'),content=document.querySelector('#content');lockDocumentLinks(content);
  const say=translate({'zh-CN':{loading:'正在加载 PPT…'},en:{loading:'Loading PPT…'}});
  let sourceViewer,thumbnailViewer,thumbnailContainer;
  const viewers=new Map();
  try {
    status(say('loading'));
    const {target:source}=renderTarget(document.body,960,720,true);
    sourceViewer=await PptxViewer.open(await readDocument(read,data.size),source,{renderMode:'slide',fitMode:'none',lazyMedia:true,lazySlides:true,pdfjs:false,zipLimits:RECOMMENDED_ZIP_LIMITS});
    if(!sourceViewer.slideCount)throw new Error('Presentation contains no slides');
    const dimensions=Array.from({length:sourceViewer.slideCount},()=>[sourceViewer.slideWidth,sourceViewer.slideHeight]);
    let reader;
    const navigation=pageSidebar({state:()=>reader?.state()??{count:0,page:1},navigate:value=>reader?.navigate(value),refresh:()=>reader?.publish(),
      thumbnail:async number=>{
        if(!thumbnailViewer){thumbnailContainer=renderTarget(document.body,sourceViewer.slideWidth,sourceViewer.slideHeight,true).target;
          thumbnailViewer=new PptxViewer(thumbnailContainer,{fitMode:'none',lazyMedia:true,pdfjs:false});thumbnailViewer.load(sourceViewer.presentationData);}
        await thumbnailViewer.renderSlide(number-1);
        return documentThumbnail(thumbnailContainer.firstElementChild,...dimensions[number-1]);
      }});
    reader=await pagedDocument({viewport,content,dimensions,navigation,lazy:true,mount:async(index,surface)=>{
      const {target}=renderTarget(surface,...dimensions[index]);
      const viewer=new PptxViewer(target,{renderMode:'slide',fitMode:'none',lazyMedia:true,lazySlides:true,pdfjs:false});
      viewers.set(index,viewer);viewer.load(sourceViewer.presentationData);await viewer.renderSlide(index);await viewer.setZoom(100);
    },unmount:index=>{viewers.get(index)?.destroy();viewers.delete(index);}});
    reader.publish();await presented();
    addEventListener('pagehide',()=>{thumbnailViewer?.destroy();sourceViewer?.destroy();},{once:true});
  }catch(error){const message=String(error?.message??error);status(message);await presented(message);}
}
