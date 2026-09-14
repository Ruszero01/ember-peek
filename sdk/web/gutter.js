import { lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
/** Shared logical line numbers. Wrapped visual rows do not create extra numbers. */
export function textGutter(enabled = true) {
  return enabled ? [lineNumbers(), highlightActiveLineGutter()] : [];
}
