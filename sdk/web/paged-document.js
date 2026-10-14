import { controls, status, shortcuts, configuration, onSettings, onLocale, translate } from './sdk.js';
import { documentPreferences, documentZoom, pageGeometry, pageNeighborhood, documentViewportSize } from './sdk-paged-geometry.js';

/** Shared paginated presentation; rendering and thumbnail semantics remain with each plugin. */
export async function pagedDocument({ viewport, content, dimensions, mount, unmount = () => {}, navigation, lazy = false, initial = {} }) {
  const say = translate({
    'zh-CN': { previous:'上一页', next:'下一页', page:'页码', zoom:'缩放比例', fit:'适配窗口', rotate:'顺时针旋转', info:'第 {page} / {count} 页 · {zoom}%' },
    en: { previous:'Previous page', next:'Next page', page:'Page', zoom:'Zoom', fit:'Fill window', rotate:'Rotate clockwise', info:'Page {page} / {count} · {zoom}%' },
  });
  let { reading, mode } = documentPreferences(configuration());
  let defaults = documentPreferences(configuration()), page = initial.page ?? 0, zoom = 1, rotation = 0, frame, resizeFrame, lastLayoutSize, disposed = false, version = 0, chain = Promise.resolve();
  content.classList.add('paged-document');
  const slots = dimensions.map(([width, height], index) => {
    const slot = document.createElement('div'), surface = document.createElement('div');
    slot.className = 'document-page'; surface.className = 'document-page-surface';
    surface.style.width = `${width}px`; surface.style.height = `${height}px`;
    slot.append(surface); content.append(slot);
    return { slot, surface, mounted: false, index };
  });
  const state = () => ({ count: slots.length, page: page + 1, ratio: dimensions[page][0] / dimensions[page][1] });
  function publish() {
    controls([
      navigation.control(),
      { id:'previous', kind:'button', label:say('previous'), icon:'chevron-left', run:()=>navigate(page) },
      ...(slots.length > 1 ? [{ id:'page', kind:'scrub', defaultValue:1, label:say('page'), value:page+1, min:1, max:slots.length, direction:'down', run:navigate }] : []),
      { id:'next', kind:'button', label:say('next'), icon:'chevron-right', run:()=>navigate(page+2) },
      { id:'zoom', kind:'scrub', defaultValue:100, label:say('zoom'), value:zoom*100, min:Math.min(1,zoom*100), max:800, suffix:'%', run:value=>{mode='manual';layout(documentZoom(value));} },
      { id:'fit', kind:'toggle', label:say('fit'), icon:'maximize-2', active:mode==='fill', run:()=>{mode=mode==='fill'?'page':'fill';layout();} },
      { id:'rotate', kind:'button', label:say('rotate'), icon:'rotate-cw', run:()=>{rotation=(rotation+90)%360;layout();} },
    ]);
    status(say('info',{page:page+1,count:slots.length,zoom:Math.round(zoom*100)}));
    void navigation.changed();
  }
  function render() {
    const bottom = viewport.getBoundingClientRect().bottom;
    let last = page;
    while (last + 1 < slots.length && last - page < 31 && slots[last + 1].slot.getBoundingClientRect().top < bottom) last++;
    const targets = reading === 'single' ? [page] : pageNeighborhood(page, slots.length, last);
    const current = ++version;
    chain = chain.catch(() => {}).then(async () => {
      if (disposed || current !== version) return;
      if (lazy) for (const item of slots) if (item.mounted && !targets.includes(item.index)) {
        unmount(item.index, item.surface); item.surface.replaceChildren(); item.mounted = false;
      }
      for (const index of lazy ? targets : slots.map(item=>item.index)) {
        if (disposed || current !== version) return;
        const item = slots[index];
        if (!item.mounted) { await mount(index, item.surface); item.mounted = true; }
      }
    });
    return chain;
  }
  function layout(value = zoom, reset = false) {
    const selected = slots[page].slot, css = getComputedStyle(viewport);
    const paddingTop = parseFloat(css.paddingTop) || 0;
    const anchor = { x: viewport.scrollLeft / Math.max(1, selected.offsetWidth), y: Math.max(0, viewport.scrollTop + paddingTop - selected.offsetTop) / Math.max(1, selected.offsetHeight) };
    const { width, height } = documentViewportSize(viewport, css, mode);
    lastLayoutSize = `${width}:${height}`;
    zoom = pageGeometry(...dimensions[page], rotation, width, height, mode, value).scale;
    viewport.dataset.reading = reading; viewport.dataset.fit = mode;
    for (const item of slots) {
      item.slot.hidden = reading === 'single' && item.index !== page;
      const geometry = pageGeometry(...dimensions[item.index], rotation, width, height, 'manual', zoom);
      item.slot.style.width = `${geometry.width}px`; item.slot.style.height = `${geometry.height}px`;
      item.surface.style.transform = geometry.transform;
    }
    if (mode === 'page' && reading === 'single') viewport.scrollTop = viewport.scrollLeft = 0;
    else {
      viewport.scrollLeft = reset ? 0 : anchor.x * selected.offsetWidth;
      viewport.scrollTop = Math.max(0, selected.offsetTop - paddingTop + (reset ? 0 : anchor.y * selected.offsetHeight));
    }
    publish(); void render().catch(error=>status(String(error?.message??error)));
  }
  function navigate(value) {
    const next = Math.max(0, Math.min(slots.length - 1, Math.round(Number(value)||1)-1));
    if (next === page) return;
    page = next;
    if (reading === 'single') layout(zoom, true);
    else { viewport.scrollTop = slots[page].slot.offsetTop - (parseFloat(getComputedStyle(viewport).paddingTop)||0); publish(); void render().catch(error=>status(String(error?.message??error))); }
  }
  const scroll = () => {
    if (frame !== undefined || reading !== 'continuous') return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      const top = viewport.getBoundingClientRect().top + (parseFloat(getComputedStyle(viewport).paddingTop)||0);
      const next = slots.findIndex(item => item.slot.getBoundingClientRect().bottom > top + 1);
      if (next >= 0 && next !== page) { page = next; publish(); void render().catch(error=>status(String(error?.message??error))); }
    });
  };
  const wheel = event => { if (!event.ctrlKey) return; event.preventDefault(); mode='manual';layout(documentZoom(zoom*100*(event.deltaY<0?1.1:1/1.1))); };
  viewport.addEventListener('scroll', scroll, {passive:true}); viewport.addEventListener('wheel', wheel, {passive:false});
  const observer = new ResizeObserver(() => {
    if (mode === 'manual' || resizeFrame !== undefined) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined;
      if (disposed || mode === 'manual') return;
      const css = getComputedStyle(viewport);
      const { width, height } = documentViewportSize(viewport, css, mode);
      if (`${width}:${height}` !== lastLayoutSize) layout();
    });
  }); observer.observe(viewport);
  const settingsOff = onSettings(settings => {
    const next = documentPreferences(settings);
    if (next.reading === defaults.reading && next.mode === defaults.mode) return;
    if (next.reading !== defaults.reading) reading = next.reading;
    if (next.mode !== defaults.mode) mode = next.mode;
    defaults = next; layout();
  });
  const localeOff = onLocale(publish);
  await shortcuts([
    {id:'previous',key:'ArrowLeft',run:()=>navigate(page)}, {id:'next',key:'ArrowRight',run:()=>navigate(page+2)},
    {id:'previous-page',key:'PageUp',run:()=>navigate(page)}, {id:'next-page',key:'PageDown',run:()=>navigate(page+2)},
    {id:'scroll-up',key:'ArrowUp',run:()=>viewport.scrollBy({top:-80})}, {id:'scroll-down',key:'ArrowDown',run:()=>viewport.scrollBy({top:80})},
    {id:'first',key:'Home',run:()=>navigate(1)}, {id:'last',key:'End',run:()=>navigate(slots.length)},
  ]);
  layout(zoom, true); await render();
  addEventListener('pagehide', () => {
    disposed = true; version++; observer.disconnect(); settingsOff(); localeOff();
    viewport.removeEventListener('scroll',scroll); viewport.removeEventListener('wheel',wheel);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    for (const item of slots) if (item.mounted) unmount(item.index,item.surface);
  }, {once:true});
  return { state, navigate, publish };
}
