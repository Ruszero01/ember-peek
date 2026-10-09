export function pageNumber(value, count) { return Math.max(1, Math.min(count, Math.round(Number(value) || 1))); }
export function positionState(value, count) {
  const fraction = number => Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  return { page: pageNumber(value?.page, count), x: fraction(value?.x), y: fraction(value?.y) };
}
export function command(state, page, value = {}) {
  return { ...value, revision: state.revision, page: pageNumber(page, state.pages) };
}
export function canSelect(state, rendered, page, busy) {
  return !!state.editable && !busy && rendered?.revision === state.revision && rendered?.page === page;
}
export function renderPosition(requested, current, started, viewport, matchingPage) {
  return current && matchingPage && (viewport.scrollTop !== started.top || viewport.scrollLeft !== started.left) ? current : requested;
}
export function objectBounds(object, width, height) {
  const [x,y,w,h] = object.bounds;
  return { left: `${x / width * 100}%`, top: `${y / height * 100}%`, width: `${w / width * 100}%`, height: `${h / height * 100}%` };
}
export function pageGeometry(width, height, availableWidth, availableHeight, fill, zoom) {
  const scale = Math.max(0.01, Math.min(8, zoom ?? (fill ? Math.max : Math.min)(availableWidth / width, availableHeight / height)));
  return { width: width * scale, height: height * scale, scale };
}
export async function imageBase64(file) {
  if (!file || !["image/png", "image/jpeg"].includes(file.type)) throw new Error("Choose a PNG or JPEG image");
  if (file.size > 4 * 1024 * 1024) throw new Error("Replacement image is limited to 4 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 65536) binary += String.fromCharCode(...bytes.subarray(offset, offset + 65536));
  return btoa(binary);
}

export function imageResize(bounds, corner, dx, dy, pageWidth, pageHeight, proportional = true) {
  const [x,y,w,h]=bounds;
  const west=corner.includes('w'),north=corner.includes('n');
  const ax=west ? x+w : x,ay=north ? y+h : y;
  const scale=Math.max(0.05,Math.min(20,((west?-dx:dx)*w+(north?-dy:dy)*h)/(w*w+h*h)+1,(west?ax:pageWidth-ax)/w,(north?ay:pageHeight-ay)/h));
  const scaleX=proportional?scale:Math.max(0.05,Math.min(20,1+(west?-dx:dx)/w,(west?ax:pageWidth-ax)/w));
  const scaleY=proportional?scale:Math.max(0.05,Math.min(20,1+(north?-dy:dy)/h,(north?ay:pageHeight-ay)/h));
  return {scale,scaleX,scaleY,corner,bounds:[west?ax-w*scaleX:ax,north?ay-h*scaleY:ay,w*scaleX,h*scaleY]};
}

export function cancelResizeKey(event,cancel) {
  if(event.key!=="Escape")return false;
  event.preventDefault();event.stopPropagation();cancel();return true;
}
