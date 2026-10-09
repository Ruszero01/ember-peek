/** Coordinate opaque state without letting a hidden or restoring view overwrite it. */
export async function createStateSynchronizer(api, get, restore) {
  const initial = await api.ready;
  let visible = initial.visible, restoring = false, sequence = 0, last;
  let writes = Promise.resolve();
  async function receive() {
    const ticket = ++sequence;
    restoring = true;
    try {
      const state = await api.viewState();
      if (!visible || ticket !== sequence) return;
      if (state !== null) await restore(state);
      if (ticket === sequence) last = JSON.stringify(get());
    } finally {
      if (ticket === sequence) restoring = false;
    }
  }
  function flush() {
    if (!visible || restoring) return writes;
    const value = get();
    if (value === undefined) return writes;
    const encoded = JSON.stringify(value);
    if (encoded === last) return writes;
    last = encoded;
    // Dispatch synchronously: the host may unmount this view after visibility changes.
    const write = api.viewState(value).catch(error => {
      if (last === encoded) last = undefined;
      api.onError?.(error);
    });
    writes = Promise.all([writes, write]).then(() => {});
    return writes;
  }
  const unsubscribe = api.onVisibility(next => {
    if (!next) void flush();
    visible = next;
    if (next) void receive().catch(error => api.onError?.(error));
    else { sequence++; restoring = false; }
  });
  if (visible) await receive();
  return { changed: flush, flush, dispose: unsubscribe };
}
