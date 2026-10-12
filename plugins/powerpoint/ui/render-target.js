/** Keep renderer-owned styles inside a fixed geometry boundary. */
export function renderTarget(parent, width, height, offscreen = false) {
  const frame = parent.ownerDocument.createElement('div'), target = parent.ownerDocument.createElement('div');
  frame.style.width = target.style.width = `${width}px`;
  frame.style.height = target.style.height = `${height}px`;
  if (offscreen) {
    Object.assign(frame.style, {position:'fixed',left:'-10000px',top:'0',contain:'strict',overflow:'hidden',visibility:'hidden',pointerEvents:'none'});
  }
  frame.append(target);parent.append(frame);
  return {frame,target};
}
