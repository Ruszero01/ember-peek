import "./shortcuts.js";
import { ready, call, mutate, controls, status, presented, panel, pending, fileChanged, postTo, onMessage, shortcuts, translate, onLocale, synchronizeState } from "./sdk.js";
import { pageNumber, positionState, command, objectBounds, pageGeometry, imageBase64, canSelect, renderPosition, imageResize, cancelResizeKey } from "./document.js";

const say = translate({
  "zh-CN": {
    previous:"上一页",next:"下一页",page:"页码",fit:"适配窗口",zoom:"缩放比例",edit:"编辑对象",save:"保存",undo:"撤销",discard:"放弃更改",add:"在当前页后插入空白页",remove:"删除当前页",cancel:"取消",
    text:"文字内容",font:"字体",original:"原字体",simhei:"黑体",apply:"应用文字",replace:"替换图片",image:"选择 PNG / JPEG 图片（≤4 MiB）",
    select:"点击页面中的文字或图片",textSelected:"已选择文字片段",imageSelected:"已选择图片",hint:"按片段编辑，不自动重排段落。原字体缺字时可更换字体；清空文字后应用可删除片段。",imageHint:"拖动图片四角可独立调整宽高，按住 Shift 等比例缩放。替换图片会保留当前的位置和大小。",choose:"选择图片",noFile:"尚未选择图片",resize:"拖动缩放图片",
    readonly:"此 PDF 已签名或限制修改，仅可查看",pending:"未保存的 PDF 编辑",saved:"已保存",dirty:"未保存",clean:"已保存",info:"第 {page} / {count} 页 · {state}",loading:"正在读取页面…",failed:"PDF 编辑失败：{error}",unsupported:"部分内容不是可编辑的独立文字或图片对象。",
    deleteTitle:"删除第 {page} 页？",deleteMessage:"删除会先加入草稿，保存后才修改原文件。",discardTitle:"放弃所有未保存的更改？",discardMessage:"将恢复到上次保存的 PDF。",stale:"页面已改变，请重新选择对象。"
  },
  en: {
    previous:"Previous page",next:"Next page",page:"Page",fit:"Fill window",zoom:"Zoom",edit:"Edit object",save:"Save",undo:"Undo",discard:"Discard changes",add:"Insert blank page after this page",remove:"Delete current page",cancel:"Cancel",
    text:"Text",font:"Font",original:"Original font",simhei:"SimHei",apply:"Apply text",replace:"Replace image",image:"Choose PNG / JPEG (≤4 MiB)",
    select:"Select text or an image on the page",textSelected:"Text fragment selected",imageSelected:"Image selected",hint:"Edit one fragment without paragraph reflow. Choose another font if glyphs are missing. Apply empty text to delete the fragment.",imageHint:"Drag a corner to adjust width and height independently; hold Shift to preserve proportions. Replacement keeps the current position and size.",choose:"Choose image",noFile:"No image selected",resize:"Drag to resize image",
    readonly:"Signed or restricted PDF; viewing only",pending:"unsaved PDF edits",saved:"Saved",dirty:"Unsaved",clean:"Saved",info:"Page {page} / {count} · {state}",loading:"Reading page…",failed:"PDF editing failed: {error}",unsupported:"Some content is not an editable independent text or image object.",
    deleteTitle:"Delete page {page}?",deleteMessage:"The deletion stays in the draft until you save.",discardTitle:"Discard all unsaved changes?",discardMessage:"Restore the last saved PDF.",stale:"The page changed; select the object again."
  }
});
const initial = await ready;
document.body.classList.toggle("panel", initial.role === "panel");
if (initial.role === "panel") await mountPanel(); else await mountView();

async function mountPanel() {
  const element = id => document.getElementById(id);
  element("editor").hidden = false;
  let current, selectionKey;
  function labels() {
    for (const [id,key] of [["text-label","text"],["font-label","font"],["image-label","image"],["apply","apply"],["replace","replace"],["save","save"],["undo","undo"],["choose","choose"]]) element(id).textContent = say(key);
    element("font").querySelector('[value="original"]').textContent = say("original");
    element("font").querySelector('[value="simhei"]').textContent = say("simhei");
  }
  function receive(message) {
    if (message?.type !== "state") return;
    current = message;
    const selected = message.selected;
    const key = `${message.revision}:${message.page}:${selected?.id}`;
    if (key !== selectionKey) {
      element("text").value = selected?.text ?? "";
      element("font").value = "original";
      element("replacement").value = "";
      selectionKey = key;
    }
    element("selection").textContent = !message.editable ? say("readonly") : say(!selected ? "select" : selected.kind === "text" ? "textSelected" : "imageSelected");
    element("hint").textContent = selected?.kind === "image" ? say("imageHint") : say("hint");
    element("text-fields").hidden = selected?.kind !== "text" || !message.editable;
    element("image-fields").hidden = selected?.kind !== "image" || !message.editable;
    element("note").textContent = message.note || (message.unsupported ? say("unsupported") : "");
    for (const id of ["apply","replace","save","text","font","replacement"]) element(id).disabled = message.busy || !message.editable;
    element("undo").disabled = message.busy || !message.undo;
    element("choose").disabled = message.busy || !message.editable;
    fileLabel();
  }
  function fileLabel(){element("file-name").textContent=element("replacement").files[0]?.name || say("noFile");element("replace").disabled=!!current?.busy || !current?.editable || !element("replacement").files[0];}
  element("choose").onclick=()=>element("replacement").click();
  element("replacement").onchange=fileLabel;
  async function send(type, value = {}) {
    if (!current || current.busy) return;
    try { await postTo("view", { type, revision: current.revision, ...value }); }
    catch (error) { element("note").textContent = String(error); }
  }
  function textEdit() { return { object: current.selected.id, text: element("text").value, font: element("font").value }; }
  element("apply").onclick = () => void send("editText", textEdit());
  element("replace").onclick = async () => {
    try { await send("replaceImage", { object: current.selected.id, image: await imageBase64(element("replacement").files[0]) }); }
    catch (error) { element("note").textContent = String(error); }
  };
  async function save() {
    if (!current || current.busy) return;
    try {
      let edit;
      if (current.selected?.kind === "text" && (element("text").value !== current.selected.text || element("font").value !== "original")) edit = { method: "editText", ...textEdit() };
      else if (current.selected?.kind === "image" && element("replacement").files[0]) edit = { method: "replaceImage", object: current.selected.id, image: await imageBase64(element("replacement").files[0]) };
      await send("save", { edit });
    } catch (error) { element("note").textContent = String(error); }
  }
  element("save").onclick = () => void save();
  element("undo").onclick = () => void send("undo");
  onMessage(receive);
  onLocale(() => { labels(); if (current) receive(current); });
  labels();fileLabel();
  await shortcuts([{ id:"save", key:"Ctrl+s", allowInInputs:true, run:save }]);
  await postTo("view", { type:"hello" });
}

async function mountView() {
  const viewport = document.querySelector("#viewport"), pageElement = document.querySelector("#page"), image = document.querySelector("#image"), objects = document.querySelector("#objects");
  let state = initial.data, page = state.page, selected, pageData, busy = false, rendering = false, usable = false, closed = false;
  let panelOpen = false, fill = true, manualZoom, note = "", generation = 0, navigation, queue = Promise.resolve();
  function position() {
    if (!usable || viewport.clientWidth === 0 || viewport.clientHeight === 0) return undefined;
    return positionState({ page, x:viewport.scrollLeft / Math.max(1,pageElement.offsetWidth), y:(viewport.scrollTop-pageElement.offsetTop) / Math.max(1,pageElement.offsetHeight) }, state.pages);
  }
  function syncPanel() {
    void postTo("panel", { type:"state", ...state, page, selected, busy:busy || rendering, note, unsupported:pageData?.unsupported ?? 0 }).catch(() => {});
  }
  function publish() {
    const items = [
      {id:"previous",kind:"button",label:say("previous"),icon:"chevron-left",run:()=>navigate(page-1)},
      ...(state.pages > 1 ? [{id:"page",kind:"scrub",label:say("page"),value:page,min:1,max:state.pages,direction:"down",run:navigate}] : []),
      {id:"next",kind:"button",label:say("next"),icon:"chevron-right",run:()=>navigate(page+1)},
      {id:"fit",kind:"toggle",label:say("fit"),icon:"maximize-2",active:fill && manualZoom === undefined,run:()=>{if(busy)return;fill=!(fill && manualZoom === undefined);manualZoom=undefined;void renderPage(position());}},
      {id:"zoom",kind:"scrub",label:say("zoom"),value:Math.max(1,geometry().scale*100),min:1,max:800,suffix:"%",run:value=>{if(busy)return;manualZoom=Number(value)/100;void renderPage(position());}},
      {id:"edit",kind:"toggle",label:say("edit"),icon:"file-pen",active:panelOpen,run:()=>setPanel(!panelOpen)},
    ];
    if (state.editable) items.push(
      {id:"save",kind:"button",label:say("save"),icon:"save",run:()=>operate("save")},
      {id:"add",kind:"button",label:say("add"),icon:"file-plus",run:()=>operate("insertPage")},
      ...(state.pages > 1 ? [{id:"remove",kind:"button",label:say("remove"),icon:"file-minus",run:()=>confirmOperation("deletePage")}] : []),
      ...(state.undo ? [{id:"undo",kind:"button",label:say("undo"),icon:"undo-2",run:()=>operate("undo")}] : []),
      ...(state.dirty ? [{id:"discard",kind:"button",label:say("discard"),icon:"rotate-ccw",run:()=>confirmOperation("revert")}] : []),
    );
    controls(items);
    status(note || (!state.editable ? say("readonly") : say("info", {page,count:state.pages,state:say(state.dirty ? "dirty" : "clean")})));
    syncPanel();
  }
  function geometry() {
    const css = getComputedStyle(viewport);
    return pageGeometry(state.width,state.height,Math.max(1,viewport.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)),Math.max(1,viewport.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)),fill,manualZoom);
  }
  function setPanel(value) { panelOpen=value;void panel(value);publish(); }
  function select(object) {
    if (!canSelect(state,pageData,page,busy)) return;
    selected = object;
    for (const button of objects.children) button.classList.toggle("selected", Number(button.dataset.id) === selected.id);
    setPanel(true);
  }
  let drag;
  function startResize(event,button,object,corner){
    if(event.button!==0 || !canSelect(state,pageData,page,busy))return;
    event.preventDefault();event.stopPropagation();generation++;rendering=false;select(object);
    const rect=pageElement.getBoundingClientRect(),bounds=object.bounds.map((v,i)=>v/(i%2?pageData.pixelHeight:pageData.pixelWidth));
    drag={button,object,corner,bounds,startX:event.clientX,startY:event.clientY,width:rect.width,height:rect.height,pointer:event.pointerId,scaleX:1,scaleY:1};
    event.target.setPointerCapture(event.pointerId);document.body.classList.add("resizing");
    const handle=event.target;
    const move=e=>{if(!drag)return;const value=imageResize(bounds,corner,(e.clientX-drag.startX)/drag.width,(e.clientY-drag.startY)/drag.height,1,1,e.shiftKey);drag.scaleX=value.scaleX;drag.scaleY=value.scaleY;Object.assign(button.style,objectBounds({bounds:value.bounds},1,1));};
    const finish=e=>{if(!drag)return;const value=drag;drag=undefined;document.body.classList.remove("resizing");handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",finish);handle.removeEventListener("pointercancel",cancel);window.removeEventListener("keydown",escape,true);Object.assign(button.style,objectBounds(object,pageData.pixelWidth,pageData.pixelHeight));if(e.type==="pointerup" && (Math.abs(value.scaleX-1)>0.001 || Math.abs(value.scaleY-1)>0.001))void operate("resizeImage",{object:object.id,scaleX:value.scaleX,scaleY:value.scaleY,corner});};
    const cancel=()=>finish({type:"cancel"});const escape=e=>cancelResizeKey(e,cancel);
    handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",finish);handle.addEventListener("pointercancel",cancel);window.addEventListener("keydown",escape,true);
  }
  async function renderPage(restore) {
    const ticket = ++generation;
    const started = { top:viewport.scrollTop, left:viewport.scrollLeft };
    rendering = true; syncPanel();
    queue = queue.catch(()=>{}).then(async()=>{
      if (closed || ticket !== generation) return;
      const result = await call("page", command(state,page,{width:Math.round(Math.min(1600,geometry().width*devicePixelRatio))}));
      if (closed || ticket !== generation) return;
      const bitmap = new Image();
      bitmap.src = `data:image/png;base64,${result.image}`;
      await bitmap.decode();
      if (closed || ticket !== generation) return;
      const destination = renderPosition(restore,position(),started,viewport,pageData?.revision === state.revision && pageData?.page === page);
      pageData=result;
      if(selected)selected=result.objects.find(object=>object.id===selected.id);
      state={...state,width:result.width,height:result.height};
      const size=geometry();
      pageElement.style.width=`${size.width}px`;pageElement.style.height=`${size.height}px`;
      image.src=bitmap.src;
      objects.replaceChildren();
      if (state.editable) for (const object of result.objects) {
        const button=document.createElement("button");button.className="object";button.dataset.id=String(object.id);
        Object.assign(button.style,objectBounds(object,result.pixelWidth,result.pixelHeight));
        button.title=object.kind === "text" ? object.text.slice(0,120) : say("imageSelected");
        button.setAttribute("aria-label",button.title || say("textSelected"));
        button.classList.toggle("selected",selected?.id === object.id);
        button.onclick=()=>select(object);objects.append(button);
        if(object.kind === "image") for(const corner of ["nw","ne","sw","se"]){const handle=document.createElement("span");handle.className=`resize-handle ${corner}`;handle.title=say("resize");handle.onpointerdown=event=>startResize(event,button,object,corner);button.append(handle);}
      }
      const value=positionState(destination ?? {page,x:0,y:0},state.pages);
      viewport.scrollLeft=value.x*pageElement.offsetWidth;
      viewport.scrollTop=pageElement.offsetTop+value.y*pageElement.offsetHeight;
      usable=true;rendering=false;publish();
      await presented();
      void navigation?.changed();
    }).catch(async error=>{
      if (ticket !== generation || closed) return;
      rendering=false;note=say("failed",{error:String(error)});publish();
      if (!usable) await presented(note);
    });
    return queue;
  }
  function navigate(value) {
    if (busy || drag) return;
    const next=pageNumber(value,state.pages);
    if(next===page)return;
    page=next;selected=undefined;note="";void renderPage();publish();
  }
  async function confirmOperation(method) {
    if(busy || rendering)return;
    const {confirmDialog}=await import("./sdk.js");
    const result=await confirmDialog({title:say(method === "deletePage" ? "deleteTitle" : "discardTitle",{page}),message:say(method === "deletePage" ? "deleteMessage" : "discardMessage"),cancelLabel:say("cancel"),actions:[{id:"yes",label:say(method === "deletePage" ? "remove" : "discard"),tone:"danger",primary:true}]});
    if(result==="yes")await operate(method);
  }
  async function operate(method, payload = {}) {
    if(busy || rendering || !state.editable || closed)return;
    if(method==="save" && !state.dirty)return;
    const priorPosition=position();
    busy=true;generation++;note="";publish();
    try {
      await queue;
      rendering=false;
      if(!["save","undo","revert"].includes(method))await pending(true,say("pending"));
      if(method==="save")await navigation?.flush();
      const result=await (method==="save" ? mutate : call)(method,command(state,page,payload));
      state=result;page=result.page;selected=method==="resizeImage" ? selected : undefined;
      await pending(state.dirty,state.dirty ? say("pending") : undefined);
      await renderPage(["insertPage","deletePage"].includes(method) ? undefined : {...priorPosition,page});
      await navigation?.changed();
      if(method==="save") {note=say("saved");publish();await navigation?.flush();await fileChanged();}
    } catch(error) {
      note=String(error).includes("Selection is out of date") ? say("stale") : say("failed",{error:String(error)});
      selected=undefined;
      await pending(state.dirty,state.dirty ? say("pending") : undefined).catch(()=>{});
    } finally {busy=false;publish();}
  }
  onMessage(message=>{
    if(message?.type==="hello"){syncPanel();return;}
    if(!message || !["editText","replaceImage","save","undo"].includes(message.type))return;
    if(message.revision!==state.revision){note=say("stale");publish();return;}
    void (async()=>{
      if(message.type==="save" && message.edit){await operate(message.edit.method,message.edit);if(note && note!==say("saved"))return;}
      await operate(message.type,message);
    })();
  });
  try {
    state=await call("state",{});page=pageNumber(page,state.pages);
    navigation=await synchronizeState(position,async value=>{
      const restored=positionState(value,state.pages);
      if(page!==restored.page)selected=undefined;
      page=restored.page;
      await renderPage(restored);
    });
    if(!usable)await renderPage();
    await shortcuts([
      {id:"save",key:"Ctrl+s",run:()=>operate("save")},
      {id:"undo",key:"Ctrl+z",run:()=>operate("undo")},
      {id:"previous",key:"ArrowLeft",repeat:true,run:()=>navigate(page-1)},
      {id:"next",key:"ArrowRight",repeat:true,run:()=>navigate(page+1)},
      {id:"scrollUp",key:"ArrowUp",repeat:true,run:()=>viewport.scrollBy({top:-80})},
      {id:"scrollDown",key:"ArrowDown",repeat:true,run:()=>viewport.scrollBy({top:80})},
    ]);
    viewport.addEventListener("scroll",()=>{if(!rendering)void navigation.changed();});
    new ResizeObserver(()=>{if(usable && !busy && !rendering && !drag && viewport.clientWidth > 0 && viewport.clientHeight > 0)void renderPage(position());}).observe(viewport);
    onLocale(publish);
    window.addEventListener("pagehide",()=>{void navigation.flush();navigation.dispose();closed=true;generation++;});
  }catch(error){await presented(say("failed",{error:String(error)}));}
}
