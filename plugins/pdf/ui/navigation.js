export function pdfShortcuts(actions) {
  return [
    { id: "previous", key: "ArrowLeft", repeat: true, run: actions.previous },
    { id: "next", key: "ArrowRight", repeat: true, run: actions.next },
    { id: "scroll-up", key: "ArrowUp", repeat: true, run: actions.scrollUp },
    { id: "scroll-down", key: "ArrowDown", repeat: true, run: actions.scrollDown },
    { id: "first", key: "Home", run: actions.first },
    { id: "last", key: "End", run: actions.last },
  ];
}

export function animateScroll(viewport, top, done, {
  duration = 220, now = () => performance.now(),
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
} = {}) {
  const from = viewport.scrollTop;
  const start = now();
  let frame;
  let cancelled = false;
  const tick = time => {
    if (cancelled) return;
    const progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, (time - start) / duration));
    viewport.scrollTop = from + (top - from) * (1 - (1 - progress) ** 3);
    if (progress < 1) frame = requestFrame(tick);
    else done();
  };
  frame = requestFrame(tick);
  return () => { cancelled = true; cancelFrame(frame); };
}
