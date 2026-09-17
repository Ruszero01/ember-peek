import { ready, onVisibility, viewState } from "../index.js";
export async function synchronizePosition(get, restore) {
  const initial = await ready;
  let visible = initial.visible,
    restoring = false,
    sequence = 0,
    last = "";
  let writes = Promise.resolve();
  async function receive() {
    const ticket = ++sequence;
    const state = await viewState().catch(() => null);
    if (!visible || ticket !== sequence || !state) return;
    restoring = true;
    restore(state);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        restoring = false;
      }),
    );
  }
  function flush() {
    if (!visible || restoring) return writes;
    const state = get(),
      encoded = JSON.stringify(state);
    if (encoded === last) return writes;
    last = encoded;
    // Send before the host can unmount this view; do not leave a trailing debounce timer.
    const write = viewState(state).catch(() => {
      last = "";
    });
    writes = Promise.all([writes, write]).then(() => {});
    return writes;
  }
  onVisibility((next) => {
    if (!next) void flush();
    visible = next;
    if (next) void receive();
    else sequence++;
  });
  if (visible) await receive();
  return { changed: flush, flush };
}
