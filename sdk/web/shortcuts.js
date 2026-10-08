// Shared shortcut validation and matching; host owns dispatch, plugins own actions.
const modifiers = ["Ctrl", "Alt", "Shift", "Meta"];
export function validateShortcuts(value) {
  if (!Array.isArray(value) || value.length > 32) throw new TypeError("Invalid shortcut list");
  const ids = new Set(), strokes = new Set();
  return value.map(item => {
    if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(item.id) || ids.has(item.id))
      throw new TypeError("Invalid or duplicate shortcut id");
    if (typeof item.key !== "string" || item.key.length > 80) throw new TypeError("Invalid shortcut key");
    const parts = item.key.split("+");
    const key = parts.pop();
    if (!key || !(key.length === 1 && /^[a-z0-9]$/i.test(key) || /^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown|Enter|Delete|Backspace|F([1-9]|1[0-2]))$/.test(key)) ||
        parts.some(p => !modifiers.includes(p)) || new Set(parts).size !== parts.length)
      throw new TypeError("Invalid shortcut key");
    const normalized = [...modifiers.filter(m => parts.includes(m)), key.length === 1 ? key.toLowerCase() : key].join("+");
    if (key.toLowerCase() === "o" && (parts.includes("Ctrl") || parts.includes("Meta"))) throw new TypeError("Shortcut is reserved by the host");
    if (strokes.has(normalized)) throw new TypeError("Duplicate shortcut key");
    for (const flag of ["allowInInputs", "repeat"]) {
      if (item[flag] !== undefined && typeof item[flag] !== "boolean") throw new TypeError("Invalid shortcut option");
    }
    ids.add(item.id); strokes.add(normalized);
    return {id: item.id, key: normalized, allowInInputs: item.allowInInputs === true, repeat: item.repeat === true};
  });
}
export function shortcutStroke(event) {
  return [...modifiers.filter((_, i) => [event.ctrlKey, event.altKey, event.shiftKey, event.metaKey][i]),
    event.key?.length === 1 ? event.key.toLowerCase() : event.key].join("+");
}
export function matchShortcut(items, event, inInput = false) {
  if (event.isComposing || event.defaultPrevented || event.key === "Process") return undefined;
  const key = shortcutStroke(event);
  return items.find(item => item.key === key && (!inInput || item.allowInInputs) && (!event.repeat || item.repeat));
}
