const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const V = 'urn:schemas-microsoft-com:vml';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export function pageBackgroundCandidate(width, height, pageWidth, pageHeight, behind, fill, imageId) {
  if (!behind || ![width,height,pageWidth,pageHeight].every(v=>Number.isFinite(v)&&v>0)) return null;
  if (Math.abs(width/pageWidth-1)>0.03 || Math.abs(height/pageHeight-1)>0.03) return null;
  const color = /^#[0-9a-f]{6}$/i.test(fill) ? fill : null;
  return color || imageId ? {color,imageId} : null;
}

// Only page-sized behind-text groups are treated as decorative backgrounds.
export async function restorePageBackgrounds(model, pages) {
  const part=model.documentPart, xml=part._xmlDocument;
  if (!xml) return;
  const size=xml.getElementsByTagNameNS(W,'pgSz')[0];
  const width=Number(size?.getAttributeNS(W,'w'))*635, height=Number(size?.getAttributeNS(W,'h'))*635;
  let page=0;
  for (const element of xml.getElementsByTagName('*')) {
    if (element.namespaceURI===W && element.localName==='br' && element.getAttributeNS(W,'type')==='page') page++;
    if (element.namespaceURI!==WP || element.localName!=='anchor') continue;
    const extent=element.getElementsByTagNameNS(WP,'extent')[0];
    const alternate=element.parentElement?.parentElement?.parentElement;
    const group=alternate?.getElementsByTagNameNS(V,'group')[0];
    if (!group) continue;
    const rect=group.getElementsByTagNameNS(V,'rect')[0];
    const image=group.getElementsByTagNameNS(V,'imagedata')[0];
    const candidate=pageBackgroundCandidate(Number(extent?.getAttribute('cx')),Number(extent?.getAttribute('cy')),width,height,
      element.getAttribute('behindDoc')==='1',rect?.getAttribute('fillcolor')?.split(' ')[0]??'',image?.getAttributeNS(R,'id')??null);
    const target=pages[page];
    if (!candidate || !target) continue;
    if(candidate.color) target.style.backgroundColor=candidate.color;
    if(candidate.imageId) {
      const url=await model.loadDocumentImage(candidate.imageId,part);
      if(url && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(url)) {
        target.style.backgroundImage='url("'+url+'")';
        target.style.backgroundSize='100% 100%';
        target.style.backgroundRepeat='no-repeat';
      }
    }
  }
}

export function restoreDefaultParagraphStyle(model) {
  const style=model.stylesPart?.styles?.find(s=>s.isDefault && s.target==='p');
  if (!style?.id) return;
  const visit=node=>{
    if(node.type==='paragraph' && !node.styleName) node.styleName=style.id;
    for(const child of node.children??[]) visit(child);
  };
  for(const part of model.parts??[model.documentPart]) {
    if(part.body) visit(part.body);
  }
}
