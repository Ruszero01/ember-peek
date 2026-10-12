import {BufferGeometry,Float32BufferAttribute} from 'three';
import {Brush,Evaluator,SUBTRACTION,HOLLOW_SUBTRACTION} from 'three-bvh-csg';

export const MAX_BOOLEAN_TRIANGLES = 6000;
export const MAX_BOOLEAN_RESULT = 20000;
function geometry(values) {
  if (!(values instanceof Float32Array) || !values.length || values.length % 27 || values.length / 27 > MAX_BOOLEAN_TRIANGLES || values.some(v=>!Number.isFinite(v))) throw Error('Invalid boolean operand');
  const positions=new Float32Array(values.length/3),colors=new Float32Array(values.length/3);
  for(let i=0;i<values.length/9;i++) {positions.set(values.subarray(i*9,i*9+3),i*3);colors.set(values.subarray(i*9+6,i*9+9),i*3);}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));return g;
}
// Coordinate welding is only a conservative eligibility check, never a topology repair.
export function closedSurface(g) {
  const p=g.getAttribute('position'),edges=new Map();
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
  for(let i=0;i<p.count;i+=3){const points=[key(i),key(i+1),key(i+2)];if(new Set(points).size!==3)return false;
    for(let j=0;j<3;j++){const a=points[j],b=points[(j+1)%3],forward=a<b,id=forward?a+'|'+b:b+'|'+a;const e=edges.get(id)??[0,0];e[0]++;e[1]+=forward?1:-1;edges.set(id,e);}}
  return [...edges.values()].every(([count,direction])=>count===2&&direction===0);
}
function orientSolid(g) {
  const p=g.getAttribute('position');let volume=0;
  for(let i=0;i<p.count;i+=3)volume+=p.getX(i)*(p.getY(i+1)*p.getZ(i+2)-p.getZ(i+1)*p.getY(i+2))+p.getY(i)*(p.getZ(i+1)*p.getX(i+2)-p.getX(i+1)*p.getZ(i+2))+p.getZ(i)*(p.getX(i+1)*p.getY(i+2)-p.getY(i+1)*p.getX(i+2));
  if(volume<0)for(const attribute of Object.values(g.attributes))for(let i=0;i<p.count;i+=3)for(let j=0;j<attribute.itemSize;j++){
    const a=(i+1)*attribute.itemSize+j,b=(i+2)*attribute.itemSize+j,value=attribute.array[a];attribute.array[a]=attribute.array[b];attribute.array[b]=value;
  }
}
export function subtract(aValues,bValues) {
  if((aValues.length+bValues.length)/27>MAX_BOOLEAN_TRIANGLES)throw Error('Boolean input exceeds quick preview budget');
  const aGeometry=geometry(aValues),bGeometry=geometry(bValues);let result;
  try {
    if(!closedSurface(bGeometry))throw Error('Boolean cutter is not a closed solid');
    const solid=closedSurface(aGeometry);orientSolid(bGeometry);if(solid)orientSolid(aGeometry);
    const a=new Brush(aGeometry),b=new Brush(bGeometry);a.updateMatrixWorld();b.updateMatrixWorld();
    const evaluator=new Evaluator();evaluator.attributes=['position','color'];evaluator.useGroups=false;
    result=evaluator.evaluate(a,b,solid?SUBTRACTION:HOLLOW_SUBTRACTION);
    const g=result.geometry,p=g.getAttribute('position'),color=g.getAttribute('color'),count=g.index?.count??p.count;
    if(!count||count%3||count/3>MAX_BOOLEAN_RESULT)throw Error('Boolean result exceeds quick preview budget');
    const output=new Float32Array(count*9);
    for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>g.index?g.index.getX(i+j):i+j);
      const points=ids.map(id=>[p.getX(id),p.getY(id),p.getZ(id)]),u=points[1].map((v,j)=>v-points[0][j]),v=points[2].map((v,j)=>v-points[0][j]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);
      for(let j=0;j<3;j++)output.set([...points[j],...normal.map(n=>length?n/length:0),color.getX(ids[j]),color.getY(ids[j]),color.getZ(ids[j])],(i+j)*9);
    }
    if(output.some(v=>!Number.isFinite(v)))throw Error('Invalid boolean result');
    return output;
  }finally{aGeometry.dispose();bGeometry.dispose();result?.geometry.dispose();}
}
