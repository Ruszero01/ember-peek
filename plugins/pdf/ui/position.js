export function pdfPosition(value, count) {
  const fraction = number => typeof number === "number" && Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  return {
    page: Number.isInteger(value?.page) ? Math.max(1, Math.min(count, value.page)) : 1,
    x: fraction(value?.x), y: fraction(value?.y),
  };
}

export function capturePosition(viewport, slot, page) {
  if (viewport.clientWidth === 0 || viewport.clientHeight === 0) return undefined;
  return { page, x: Math.max(0, Math.min(1, viewport.scrollLeft / Math.max(1, slot.offsetWidth))),
    y: Math.max(0, Math.min(1, (viewport.scrollTop - slot.offsetTop) / Math.max(1, slot.offsetHeight))) };
}

export function restorePosition(viewport, slot, position) {
  viewport.scrollLeft = slot.offsetWidth * position.x;
  viewport.scrollTop = slot.offsetTop + slot.offsetHeight * position.y;
}
