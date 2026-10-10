import { ready, read, controls, status, presented, shortcuts, translate, onLocale } from './sdk.js';
import { readDocument, pageIndex, zoomFactor, rowWindow } from './sdk-document.js';
const { data } = await ready;
const viewport=document.querySelector('#viewport'),content=document.querySelector('#content');
const say=translate({
  'zh-CN':{loading:'正在加载 Excel…',sheet:'工作表',previous:'上一个工作表',next:'下一个工作表',zoom:'缩放比例',actual:'原始比例',info:'{name} · 第 {sheet} / {count} 表 · {rows} 行 × {columns} 列 · {zoom}%',limited:' · 已限制预览范围'},
  en:{loading:'Loading Excel…',sheet:'Worksheet',previous:'Previous worksheet',next:'Next worksheet',zoom:'Zoom',actual:'Actual size',info:'{name} · Sheet {sheet} / {count} · {rows} rows × {columns} columns · {zoom}%',limited:' · Preview range limited'},
});
let worker, workerUrl, sheets=[], sheet=0, zoom=1, sequence=0, revision=0, lastWindow='', queuedFrame;
const pending=new Map();
function rpc(method,value,transfer=[]){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Spreadsheet worker timed out'));worker?.terminate();},120000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,method,value},transfer);});}
function fail(error){status(String(error?.message??error));}
function publish(){const current=sheets[sheet];if(!current)return;
  controls([
    {id:'previous',kind:'button',label:say('previous'),icon:'chevron-left',run:()=>select(sheet)},
    ...(sheets.length>1?[{id:'sheet',kind:'scrub',label:say('sheet'),value:sheet+1,min:1,max:sheets.length,direction:'down',run:select}]:[]),
    {id:'next',kind:'button',label:say('next'),icon:'chevron-right',run:()=>select(sheet+2)},
    {id:'zoom',kind:'scrub',label:say('zoom'),value:zoom*100,min:25,max:200,suffix:'%',run:value=>resize(Math.max(.25,Math.min(2,zoomFactor(value))))},
    {id:'actual',kind:'button',label:say('actual'),icon:'scan',run:()=>resize(1)},
  ]);status(say('info',{name:current.name,sheet:sheet+1,count:sheets.length,rows:current.rows,columns:current.columns,zoom:Math.round(zoom*100)})+(current.truncated?say('limited'):''));
}
function columnName(index){let name='';for(index++;index>0;index=Math.floor((index-1)/26))name=String.fromCharCode(65+(index-1)%26)+name;return name;}
function select(value){sheet=pageIndex(value,sheets.length);revision++;lastWindow='';viewport.scrollTop=viewport.scrollLeft=0;publish();return render();}
function resize(value){zoom=value;content.style.zoom=String(zoom);lastWindow='';revision++;publish();return render();}
async function render(){
  const current=sheets[sheet];if(!current)return;
  const window=rowWindow(viewport.scrollTop/zoom,28,current.rows,viewport.clientHeight/zoom);
  const key=`${sheet}:${window.first}:${window.last}:${zoom}`;if(key===lastWindow)return;lastWindow=key;
  const version=++revision;
  const rows=window.last>window.first?await rpc('rows',{sheet,first:window.first,count:Math.min(200,window.last-window.first)}):[];
  if(version!==revision)return;
  const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr');
  header.append(document.createElement('th'));
  for(let i=0;i<current.columns;i++){const th=document.createElement('th');th.textContent=columnName(i+current.startColumn);header.append(th);}head.append(header);table.append(head);
  const body=document.createElement('tbody');
  function spacer(height){if(height<=0)return;const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=current.columns+1;td.className='spacer';td.style.height=`${height}px`;tr.append(td);body.append(tr);}
  spacer(window.top);
  for(let i=0;i<rows.length;i++){const tr=document.createElement('tr'),label=document.createElement('th');label.textContent=String(current.startRow+window.first+i+1);tr.append(label);
    for(const cell of rows[i]){const td=document.createElement('td');td.textContent=cell?.text??'';if(cell?.numeric)td.className='numeric';if(cell?.formula)td.title=`=${cell.formula}`;tr.append(td);}body.append(tr);
  }
  spacer(Math.max(0,current.rows-window.first-rows.length)*28);table.append(body);content.replaceChildren(table);
}
try{
  status(say('loading'));
  const [parser,model]=await Promise.all([fetch(new URL('./vendor/xlsx.full.min.js',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Spreadsheet parser unavailable');return r.text();}),fetch(new URL('./sheet-model.js',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Spreadsheet model unavailable');return r.text();})]);
  const source=parser+'\n'+model.replace(/export /g,'')+`\nlet book;self.onmessage=event=>{const {id,method,value}=event.data;try {let result;if(method==='open'){book=parseWorkbook(value,XLSX);result=book.SheetNames.map(name=>({name,...sheetRange(book.Sheets[name],XLSX)}));}else if(method==='rows'){result=readRows(book,value.sheet,value.first,value.count,XLSX);}else throw new Error('Unknown spreadsheet method');self.postMessage({id,result});}catch(error){self.postMessage({id,error:String(error.message||error)});}};`;
  workerUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(workerUrl);
  worker.onmessage=({data})=>{const request=pending.get(data.id);if(!request)return;pending.delete(data.id);clearTimeout(request.timer);data.error?request.reject(new Error(data.error)):request.resolve(data.result);};
  worker.onerror=event=>{const error=new Error(event.message||'Spreadsheet worker failed');for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();fail(error);};
  const buffer=await readDocument(read,data.size);sheets=await rpc('open',buffer,[buffer]);
  if(!sheets.length)throw new Error('Workbook contains no worksheets');
  await select(1);onLocale(publish);
  viewport.addEventListener('scroll',()=>{if(queuedFrame!==undefined)return;queuedFrame=requestAnimationFrame(()=>{queuedFrame=undefined;void render().catch(fail);});});
  addEventListener('resize',()=>{lastWindow='';void render().catch(fail);});
  await shortcuts([{id:'previous',key:'Ctrl+PageUp',run:()=>select(sheet)},{id:'next',key:'Ctrl+PageDown',run:()=>select(sheet+2)}]);
  addEventListener('pagehide',()=>{worker?.terminate();URL.revokeObjectURL(workerUrl);for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Preview closed'));}pending.clear();},{once:true});
  await presented();
}catch(error){worker?.terminate();if(workerUrl)URL.revokeObjectURL(workerUrl);const message=String(error?.message??error);status(message);await presented(message);}
