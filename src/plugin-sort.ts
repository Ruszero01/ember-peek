export function sortPosition(drag:{top:number;bottom:number;height:number;offset:number;step:number;ids:string[]},pointerY:number){
  const top=Math.max(drag.top,Math.min(drag.bottom-drag.height,pointerY-drag.offset));
  return {top,index:Math.max(0,Math.min(drag.ids.length-1,Math.round((top-drag.top)/drag.step)))};
}
export function moveSortItem(ids:string[],from:number,to:number){
  const result=[...ids];const [item]=result.splice(from,1);result.splice(to,0,item);return result;
}
