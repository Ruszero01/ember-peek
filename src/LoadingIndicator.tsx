import { useEffect, useState } from 'react';
export function LoadingIndicator({progress,label}:{progress?:number|null;label:string}) {
  const determinate=typeof progress==='number';
  const [displayProgress,setDisplayProgress]=useState(0);
  useEffect(()=>{
    if(!determinate){setDisplayProgress(0);return;}
    let second:number|undefined;
    const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>setDisplayProgress(progress!));});
    return()=>{cancelAnimationFrame(first);if(second!==undefined)cancelAnimationFrame(second);};
  },[progress,determinate]);
  const percent=determinate?Math.round(progress*100):undefined;
  const circumference=2*Math.PI*27;
  return <div className="loading-indicator" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    <svg viewBox="0 0 64 64" aria-hidden="true" className={determinate?'':'spinner'}>
      <circle className="loading-track" cx="32" cy="32" r="27" />
      <circle key={determinate?"progress":"waiting"} className="loading-arc" cx="32" cy="32" r="27" strokeDasharray={determinate?circumference:(circumference*0.24)+" "+(circumference*0.76)} strokeDashoffset={determinate?circumference*(1-displayProgress):0} transform="rotate(-90 32 32)" />
    </svg>
    {determinate&&<span aria-hidden="true">{percent}%</span>}
  </div>;
}
