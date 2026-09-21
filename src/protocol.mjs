// Control kinds a plugin view may declare. `button` fires once, `toggle` carries a
// pressed state the host draws. `scrub` carries a bounded numeric value for vertical dragging.
// Search is not a control kind: a plugin that wants a search
// bar opens its own panel and draws the bar there.
const CONTROL_KINDS = ["button", "toggle", "scrub"];

/**
 * `say` turns a message key into text in the interface language. The host always passes
 * its translator; the default is for callers that only exercise the protocol, and echoes
 * the key so a missing translator cannot pass for a translated message.
 */
export function validateControls(value, say = (key) => key) {
  if (!Array.isArray(value) || value.length > 16)
    throw new Error(say("protocol.tooManyControls"));
  const ids = new Set();
  return value.map((item) => {
    if (
      !item ||
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(item.id) ||
      ids.has(item.id)
    )
      throw new Error(say("protocol.invalidControlId"));
    if (
      !CONTROL_KINDS.includes(item.kind) ||
      typeof item.label !== "string" ||
      item.label.length > 80
    )
      throw new Error(say("protocol.invalidControl"));
    if (item.kind === "scrub" && (
      !Number.isFinite(item.value) || !Number.isFinite(item.min) || !Number.isFinite(item.max) ||
      item.min <= 0 || item.max <= item.min || item.value < item.min || item.value > item.max
    )) throw new Error(say("protocol.invalidScrubRange"));
    ids.add(item.id);
    return {
      id: item.id,
      kind: item.kind,
      label: item.label,
      icon: typeof item.icon === "string" ? item.icon.slice(0, 40) : "",
      // Only meaningful for a toggle; the host uses it to draw the pressed state.
      active: item.active === true,
      ...(item.kind === "scrub" ? { value: item.value, min: item.min, max: item.max,
        suffix: typeof item.suffix === "string" ? item.suffix.slice(0, 8) : "" } : {}),
    };
  });
}

/** Generated plugins are created against the current SDK and therefore use its full
 * control contract. Requiring an icon and an explicit toggle state keeps trial preview
 * identical to the installed host toolbar and catches incomplete agent output early. */
export function validateWorkshopControls(value, say = (key) => key) {
  const controls = validateControls(value, say);
  for (let index = 0; index < controls.length; index++) {
    const raw = value[index];
    if (
      typeof raw.icon !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.icon)
    )
      throw new Error(say("protocol.workshopControlIcon"));
    if (raw.kind === "toggle" && typeof raw.active !== "boolean")
      throw new Error(say("protocol.workshopToggleState"));
  }
  return controls;
}

// Requests that belong to the session rather than to one mount of it. A plugin entry can be
// mounted twice (view + floating panel); only the owner mount may send these, so a panel
// cannot race the view over the pending changes, the lifecycle or the document.
const SESSION_OWNING = new Set([
  "presented",
  "pending",
  "fileChanged",
  "returnView",
  "mutate",
]);

export function isSessionOwning(method) {
  return SESSION_OWNING.has(method);
}

/** The two mounts one plugin entry can have. */
export const ROLES = ["view", "panel"];

export class Selection {
  generation = 0;
  begin() {
    return ++this.generation;
  }
  current(ticket) {
    return ticket === this.generation;
  }
}

export function pluginPath(id, view) {
  return [id, ...view.split(/[\\/]/)].map(encodeURIComponent).join("/");
}

// Overlay-only contributions follow panel visibility, never stale focus. A plugin
// with both capabilities still represents its selected main view in the toolbar.
export function isContributionCurrent(contributor, active, focusedTool, expanded) {
  if (contributor.capabilities.includes("view")) return contributor.id === active;
  if (contributor.capabilities.includes("overlay")) return expanded.includes(contributor.pluginId);
  return contributor.id === active || contributor.id === focusedTool;
}
