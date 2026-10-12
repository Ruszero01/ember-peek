import { ready, onMessage, postTo, sidebar, translate, onLocale, configuration, onSettings } from './sdk.js';

const say = translate({ 'zh-CN': { title: '页面缩略图', close: '关闭缩略图', page: '第 {page} 页', failed: '缩略图不可用' }, en: { title: 'Page thumbnails', close: 'Close thumbnails', page: 'Page {page}', failed: 'Thumbnail unavailable' } });

/** Plugin-side navigation. The host never interprets page numbers or thumbnail bytes. */
export function pageSidebar({ state, navigate, thumbnail, refresh = () => {} }) {
  let open = false, initialized = false, chain = Promise.resolve();
  let defaultOpen = configuration().showThumbnails !== false;
  const setOpen = async value => { open = value; await sidebar(open); refresh(); void publish(); };
  const settingsUnsubscribe = onSettings(settings => {
    const value = settings.showThumbnails !== false;
    if (value === defaultOpen) return;
    defaultOpen = value;
    if (initialized) void setOpen(value).catch(() => {});
  });
  const queued = new Set();
  const publish = () => postTo('sidebar', { kind: 'pages', ...state() }).catch(() => {});
  const unsubscribe = onMessage((message, from) => {
    if (from !== 'sidebar' || !message) return;
    if (message.kind === 'hello') { open = true; refresh(); void publish(); }
    if (message.kind === 'closed') { open = false; refresh(); }
    if (message.kind === 'navigate' && Number.isInteger(message.page)) {
      const count = state().count;
      if (message.page >= 1 && message.page <= count) void navigate(message.page);
    }
    if (message.kind === 'thumbnail' && Number.isInteger(message.page) && message.page >= 1 && message.page <= state().count) {
      if (queued.has(message.page) || queued.size >= 32) return;
      queued.add(message.page);
      chain = chain.catch(() => {}).then(async () => {
        if (!open) { queued.delete(message.page); return; }
        try {
          const image = await thumbnail(message.page);
          // Bound plugin work and split transport to stay below the peer message budget.
          if (typeof image !== 'string' || image.length > 1024 * 1024) throw new Error('Thumbnail exceeds budget');
          for (let offset = 0; offset < image.length; offset += 40000) {
            if (!await postTo('sidebar', { kind: 'image', page: message.page, offset, total: image.length, data: image.slice(offset, offset + 40000) })) break;
          }
        } catch { await postTo('sidebar', { kind: 'image-error', page: message.page }).catch(() => {}); }
        finally { queued.delete(message.page); }
      });
    }
  });
  addEventListener('pagehide', () => { unsubscribe(); settingsUnsubscribe(); }, { once: true });
  return {
    changed: () => {
      if (!initialized && state().count > 0) {
        initialized = true;
        if (defaultOpen) return setOpen(true);
      }
      return publish();
    },
    control: () => ({ id: 'thumbnails', kind: 'toggle', label: say('title'), icon: 'panel-left', active: open, run: async () => { await setOpen(!open); } }),
  };
}

/** Virtualize rows; only visible and neighboring pages request thumbnail rendering. */
export async function mountPageSidebar() {
  await ready;
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = './sdk-page-sidebar.css'; document.head.append(css);
  document.body.replaceChildren();
  const header = document.createElement('header'), title = document.createElement('strong'), close = document.createElement('button');
  close.type = 'button'; close.textContent = '×'; header.append(title, close);
  const list = document.createElement('nav'), spacer = document.createElement('div');
  list.className = 'page-sidebar-list'; spacer.className = 'page-sidebar-spacer'; list.append(spacer); document.body.append(header, list);
  document.body.classList.add('page-sidebar');
  const images = new Map(), pending = new Map(), requested = new Set(), failures = new Set();
  let count = 0, page = 1, ratio = 0.7, previous = 0, welcomed = false;
  const label = () => { title.textContent = say('title'); close.title = say('close'); list.setAttribute('aria-label', say('title')); };
  let paintFrame;
  const schedulePaint = () => {
    if (paintFrame !== undefined) return;
    paintFrame = requestAnimationFrame(() => { paintFrame = undefined; paint(); });
  };
  const rows = new Map();
  const localeOff = onLocale(() => { label(); rows.clear(); spacer.replaceChildren(); schedulePaint(); });
  label();
  const rowHeight = () => Math.min(300, Math.max(100, (list.clientWidth - 32) / ratio)) + 36;
  function paint() {
    const height = rowHeight();
    spacer.style.height = `${count * height}px`;
    const first = Math.max(1, Math.floor(list.scrollTop / height));
    const last = Math.min(count, Math.ceil((list.scrollTop + list.clientHeight) / height) + 1);
    for (const [n, row] of rows) if (n < first || n > last) { row.button.remove(); rows.delete(n); }
    for (let n = first; n <= last; n++) {
      let row = rows.get(n);
      if (!row) {
        const button = document.createElement('button'), preview = document.createElement('div'), number = document.createElement('span');
        button.type = 'button'; button.className = 'page-thumbnail'; preview.className = 'page-thumbnail-image';
        button.setAttribute('aria-label', say('page', { page: n })); number.textContent = String(n);
        button.append(preview, number); button.onclick = () => void postTo('view', { kind: 'navigate', page: n });
        row = { button, preview, source: null }; rows.set(n, row); spacer.append(button);
      }
      const top = `${(n - 1) * height}px`, size = `${height - 8}px`, current = n === page ? 'page' : 'false';
      if (row.button.style.top !== top) row.button.style.top = top;
      if (row.button.style.height !== size) row.button.style.height = size;
      if (row.button.getAttribute('aria-current') !== current) row.button.setAttribute('aria-current', current);
      const source = images.get(n) ?? (failures.has(n) ? 'failed' : null);
      if (source !== row.source) {
        row.source = source;
        if (source && source !== 'failed') { const img = document.createElement('img'); img.src = source; img.alt = ''; row.preview.replaceChildren(img); }
        else row.preview.textContent = source === 'failed' ? say('failed') : '';
      }
      if (!images.has(n) && !requested.has(n) && !failures.has(n)) { requested.add(n); void postTo('view', { kind: 'thumbnail', page: n }); }
    }
    // Bound retained image memory independently of document length.
    for (const n of images.keys()) if (images.size > 32 && (n < first || n > last)) { images.delete(n); requested.delete(n); }
  }
  const messageOff = onMessage((message, from) => {
    if (from !== 'view' || !message) return;
    if (message.kind === 'pages') {
      if (!Number.isInteger(message.count) || message.count < 1 || message.count > 100000 || !Number.isInteger(message.page) || message.page < 1 || message.page > message.count) return;
      const nextRatio = Number.isFinite(message.ratio) && message.ratio > 0 ? message.ratio : 0.7;
      if (welcomed && count === message.count && page === message.page && ratio === nextRatio) return;
      count = message.count; page = message.page; ratio = nextRatio;
      // A restored sidebar may connect before its rebuilt primary view subscribes.
      if (!welcomed) { welcomed = true; void postTo('view', { kind: 'hello' }); }
      if (previous !== page) {
        const height = rowHeight(), top = (page - 1) * height;
        if (top < list.scrollTop || top + height > list.scrollTop + list.clientHeight) list.scrollTop = top;
        previous = page;
      }
      schedulePaint();
    } else if (message.kind === 'image') {
      const { page: n, offset, total, data } = message;
      if (!requested.has(n) || !Number.isInteger(total) || total < 1 || total > 1024 * 1024 || typeof data !== 'string' || data.length > 40000) return;
      if (offset === 0) pending.set(n, { total, data: '' });
      const item = pending.get(n);
      if (!item || item.total !== total || offset !== item.data.length || offset + data.length > total) { pending.delete(n); return; }
      item.data += data;
      if (item.data.length === total) {
        pending.delete(n);
        if (/^data:image\/(?:png|jpeg|svg\+xml)[;,]/.test(item.data)) images.set(n, item.data);
        else failures.add(n);
        schedulePaint();
      }
    } else if (message.kind === 'image-error') { failures.add(message.page); pending.delete(message.page); schedulePaint(); }
  });
  close.onclick = async () => { await postTo('view', { kind: 'closed' }); await sidebar(false).catch(() => {}); };
  list.addEventListener('scroll', schedulePaint, { passive: true });
  const observer = new ResizeObserver(schedulePaint); observer.observe(list);
  addEventListener('pagehide', () => {
    observer.disconnect(); messageOff(); localeOff();
    list.removeEventListener('scroll', schedulePaint);
    if (paintFrame !== undefined) cancelAnimationFrame(paintFrame);
  }, { once: true });
  // Handshake can arrive before the primary view has finished parsing.
  void postTo('view', { kind: 'hello' });
}

/** Snapshot a rendered office page without running its markup in the sidebar. */
export async function documentThumbnail(element, width, height) {
  async function embeddedImage(url) {
    const blob = await fetch(url).then(response => response.blob());
    if (!blob.type.startsWith('image/') || blob.size > 512 * 1024) throw new Error('Image exceeds thumbnail budget');
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  }
  const clone = element.cloneNode(true);
  const original = [element, ...element.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
  const properties = ['display','position','top','left','right','bottom','width','height','box-sizing','padding','margin','border','background','color','font','line-height','text-align','vertical-align','white-space','overflow','transform','transform-origin','opacity','flex-direction','align-items','justify-content','gap','fill','stroke','stroke-width'];
  for (let i = 0; i < copies.length; i++) {
    const node = copies[i], source = original[i];
    if (['SCRIPT','IFRAME','OBJECT','EMBED','LINK','STYLE','VIDEO','AUDIO'].includes(node.tagName)) { node.remove(); continue; }
    for (const attr of [...node.attributes]) if (/^on/i.test(attr.name) || ['href','srcset'].includes(attr.name)) node.removeAttribute(attr.name);
    const style = getComputedStyle(source);
    node.removeAttribute('style');
    for (const property of properties) node.style.setProperty(property, style.getPropertyValue(property));
    // Never let a thumbnail load remote or session URLs.
    if (node.tagName === 'IMG' && node.getAttribute('src')?.startsWith('blob:')) {
      try {
        node.setAttribute('src', await embeddedImage(node.getAttribute('src')));
      } catch { node.removeAttribute('src'); }
    }
    if (node.tagName === 'IMG' && !node.getAttribute('src')?.startsWith('data:image/')) node.removeAttribute('src');
    let background = node.style.background;
    for (const match of background.matchAll(/url\(["']?(blob:[^"')]+)["']?\)/g)) {
      try { background = background.replace(match[1], await embeddedImage(match[1])); }
      catch { background = 'transparent'; }
    }
    if (background.includes('url(') && !background.includes('data:image/')) background = 'transparent';
    node.style.background = background;
  }
  clone.style.transform = 'none'; clone.style.margin = '0'; clone.style.width = `${width}px`; clone.style.height = `${height}px`;
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const markup = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`)}`;
}
