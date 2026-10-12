export const MAX_BYTES = 1024 * 1024 * 1024;
export const MAX_TRIANGLES = 4000000;
export const MAX_VERTICES = 12000000;
export function localReference(reference) {
  const value = String(reference).trim();
  if (!value || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid model resource');
  if (/^(?:data|blob):/i.test(value)) {
    if (value.length > 64 * 1024 * 1024 * 1.4) throw new Error('Embedded model resource is too large');
    return value;
  }
  if (value.length > 4096) throw new Error('Invalid model resource');
  if (/^file:/i.test(value)) {
    const url = new URL(value);
    if (url.hostname && url.hostname !== 'localhost') throw new Error('Remote model resources are not loaded');
    if (/^\/\//.test(url.pathname)) throw new Error('Remote model resources are not loaded');
    return value;
  }
  if (/^[a-z]:[\\/]/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || /^\/\//.test(value) || /^\\\\/.test(value))
    throw new Error('Remote model resources are not loaded');
  return value;
}
export function meshStatistics(root) {
  let triangles=0,vertices=0,objects=0;
  root.traverse(node => {
    if (!node.geometry) return;
    const geometry=node.geometry,position=geometry.getAttribute('position');
    if (!position || position.itemSize !== 3) throw new Error('Invalid model positions');
    const instances = node.isInstancedMesh ? node.count : 1;
    if (!Number.isSafeInteger(instances) || instances < 0) throw new Error('Invalid model instance count');
    vertices+=position.count * instances; objects+=instances;
    if (node.isMesh) triangles+=(geometry.index?.count ?? position.count)/3 * instances;
    if (vertices>MAX_VERTICES || triangles>MAX_TRIANGLES || objects>10000) throw new Error('Model exceeds the quick preview geometry limit');
    for(let i=0;i<position.array.length;i++) if(!Number.isFinite(position.array[i]) || Math.abs(position.array[i])>1e12) throw new Error('Invalid model coordinates');
    if(geometry.index) for(const index of geometry.index.array) if(index>=position.count) throw new Error('Invalid model index');
  });
  if(!vertices) throw new Error('No saved geometry found');
  return {triangles:Math.floor(triangles),vertices,objects};
}
