import { ready, read, status, presented, translate } from './sdk.js';
import { readDocument, lockDocumentLinks } from './sdk-document.js';
import { pagedDocument } from './sdk-paged-document.js';
import { restorePageBackgrounds, restoreDefaultParagraphStyle } from './page-background.js';
import { parseAsync, renderDocument } from './vendor/docx.js';
import { mountPageSidebar, pageSidebar, documentThumbnail } from './sdk-page-sidebar.js';
const { data, role } = await ready;
if (role === 'sidebar') await mountPageSidebar();
else {
  const viewport = document.querySelector('#viewport'), content = document.querySelector('#content');
  const say = translate({'zh-CN':{loading:'正在加载 Word…'},en:{loading:'Loading Word…'}});
  lockDocumentLinks(content);
  try {
    status(say('loading'));
    const options={inWrapper:true,breakPages:true,ignoreLastRenderedPageBreak:true,keepOrigin:true,
      renderAltChunks:false,renderComments:false,renderChanges:false,useBase64URL:true};
    const model=await parseAsync(await readDocument(read,data.size),options);
    restoreDefaultParagraphStyle(model);
    content.replaceChildren(...await renderDocument(model,options));
    const pages=[...content.querySelectorAll('section.docx')];
    await restorePageBackgrounds(model,pages);
    if(!pages.length)throw new Error('Document contains no renderable pages');
    const dimensions=pages.map(element=>[element.offsetWidth,element.offsetHeight]);
    const wrappers=pages.map(element=>element.parentElement.className);
    pages.forEach(element=>element.remove()); content.replaceChildren(...content.querySelectorAll("style"));
    let reader;
    const navigation=pageSidebar({state:()=>reader?.state()??{count:0,page:1},navigate:value=>reader?.navigate(value),refresh:()=>reader?.publish(),
      thumbnail:number=>documentThumbnail(pages[number-1],...dimensions[number-1])});
    reader=await pagedDocument({viewport,content,dimensions,navigation,mount:(index,surface)=>{
      surface.className += ` ${wrappers[index]}`;surface.append(pages[index]);
    }});
    reader.publish(); await presented();
  } catch(error) { const message=String(error?.message??error);status(message);await presented(message); }
}
