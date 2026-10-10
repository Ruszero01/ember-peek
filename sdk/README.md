# Ember Peek SDK contracts

The SDK is transport code, not a rendering framework. Format parsing and presentation stay in
plugins. The build copies the required SDK files into each plugin package, so an installed plugin
does not dynamically link against host source files.

## Versioning

- `plugin.json` uses `api: 1` for the preview protocol. Unknown protocol versions are rejected.
- `ui/tool.json` uses its separate Tool API version for settings/workshop pages.
- Adding an export or an optional message field is backward-compatible. Removing an export,
  changing its meaning, or making an optional field mandatory requires a new protocol version.
- SDK bytes participate in a package `buildId`. A development rebuild therefore refreshes affected
  packages automatically. A published plugin must still bump its own SemVer version.
- Workshop projects lock the development-kit fingerprint. A changed SDK invalidates an old build
  until it is rebuilt and trial-previewed.

## Web view SDK

Numeric `scrub` controls accept optional `direction: "up" | "down"` (default `up`).
`down` puts the minimum at the top and reverses vertical dragging and Up/Down keys.
Left/Right and Home/End retain their numeric meaning. This is an additive `api:1` field;
PDF page navigation uses `down`, while zoom keeps the default direction.

The official PDF baseline uses `read()` with a PDF.js range transport and a packaged blob worker.
The worker is bundled as a classic IIFE because sandboxed opaque iframe origins cannot start
blob module workers in WebView2. Worker startup errors are reported through the presentation lifecycle.
It renders one page at a time, publishes navigation/zoom/rotation through `controls()`, and reports
page information through `status()`. No PDF-specific host API or shared source contract is added.
Its `viewMode` select setting switches immediately between single-page (default) and continuous
reading, preserving the current page. Continuous reading renders visible and neighboring pages
and releases distant canvases; scroll position updates the host page controls and status.
Both modes default to filling the window using the larger width/height scale ratio, with an
8px margin plus host safe insets. Overflow remains scrollable. The `fitWindow` boolean setting
defaults to true; false fits the entire page using the smaller scale ratio. Changes apply immediately.
The Fill window toggle reflects fill mode and switches between fill and entire-page sizing for
the current view without changing the default. Manual zoom clears the toggle's active state.
Password input, text selection, search, and editing are outside this first baseline.

Every view imports `./sdk.js` and awaits `ready` before using session-bound APIs.

| Area | Exports |
| --- | --- |
| Lifecycle | `ready`, `presented`, `onVisibility`, `pending`, `fileChanged`, `returnView` |
| Host UI | `controls`, `status`, `panel`, `confirmDialog`, `findIcons`, `createIcon` |
| Preparation | `prepare`, `hostWindow` |
| Current file | `read`, `fileUrl`, `streamUrl`, `fileBlob` |
| Linked resources | `resourceUrl`, `resourceBlob` (requires `readResources`) |
| Native/source calls | `call`, `mutate`, `sourceCall` |
| Settings | `configuration`, `onSettings`, `setSetting` |
| Language/theme | `locale`, `onLocale`, `translate`, `onTheme` |
| View/panel coordination | `postTo`, `onMessage`, `viewState` |
| Shared state lifecycle | `synchronizeState` |
| Diagnostics and clipboard | `diagnosticsOf`, `clipboard` |
| Leaving the preview | `openExternal` (requires `openLink`) |

View theme tokens include `--viewport-mode`: `window` when the view occupies the entire preview window (immersive mode), or `content` when it sits between the host bars. `--safe-top` and `--safe-bottom` remain available for scrollable content and controls that must avoid the floating bars.

`read()` is capped at 1 MiB per call. `fileUrl()` serves the current file up to 128 MiB. This session-file budget is separate from the 32 MiB package-resource limit.
Official text plugins share a 16 MiB decoding and encoded-save budget; truncated sources remain read-only to prevent overwriting unseen content.
`streamUrl()` is the format-neutral large-file path: a browser-native consumer requests byte
ranges and the host answers in bounded chunks, so playback or parsing can begin without first
copying the whole file into WebView memory.
`openExternal(url)` hands a link the user clicked to the system: the host opens it with whatever
Windows uses for that address, never inside the preview, because a sandboxed view can neither
navigate nor start anything. Send the reference exactly as the document wrote it — the host decides
what may be opened, and accepts only `http`, `https` and `mailto`. Requires `openLink`, and only the
visible mount may call it.

`resourceUrl()` resolves paths relative to the current document (including `../`, absolute paths,
and `file:` URLs) or proxies public HTTP(S) resources. Each linked resource is capped at 64 MiB;
private, loopback, and link-local network targets are rejected. Use `resourceBlob()` when a parser
needs bytes or a media element requires a `blob:` URL.

The SDK rejects pending requests immediately when its MessagePort is replaced. Requests otherwise
use the host protocol timeout because native parsing may legitimately run for up to 120 seconds.

`confirmDialog()` is declarative and format-neutral. A plugin supplies the title, optional message
and detail, up to three labelled actions with opaque ids, and an optional cancel label. The host
owns modal placement and focus, then returns the selected id or `null`; it never interprets or
executes the action. Plugin-owned functional UI stays in its view or panel. Reusable presentation
rules, including media-range and popover styles, live in `web/ui.css` rather than host components.

`prepare(facts)` is the plugin's half of the preparation phase: the host has built the preview window
but not shown it, and a plugin that declares `prepare` in its manifest is asked to state what it
needs before the user sees anything. When the preview is already visible and its active view changes,
the new view's first declaration resizes it immediately without moving it. Today the fact is
`facts.window`, the size the window should have in
CSS pixels; `hostWindow().width` and `.height` are the user's recorded baseline, even if a previous
plugin temporarily resized the actual window. Its `currentWidth` and `currentHeight` are the actual
window dimensions at connection time, which the view can compare with its own rectangle to measure
host chrome. A plugin with nothing to state calls `prepare()` immediately or calls
`presented()` instead. The host only constrains a declared size — the screen, and the smallest window
it builds (currently 320×240 CSS pixels for preview) — never chooses it, never moves the window,
and never records it as the user's own size. A declaration below either minimum is first enlarged
proportionally; the screen caps any overflow, so the plugin should fit within the actual viewport
when that cap changes the declared shape.
Only the primary view may call `prepare`.

The image and video previews both use this optional phase. Video may state a size from metadata
returned by its existing native open, or from the current media element's `loadedmetadata` event
if no native dimensions were available. The host wait still has a deadline; a late first
declaration can resize an already visible preview.

The host caches at most four recently selected completed file groups. It may release an older
completed background session before its idle timeout; plugins must treat `release` as normal
cleanup. A group with an in-flight native call or a `pending(true)` claim is protected from this
cache eviction. The hard 16-file limit remains for those protected sessions.

## Tool SDK

`web/tool.js` is a separate API for a plugin-owned tool page. It repeatedly announces readiness
until the host connects, makes connection attempts idempotent, rejects in-flight calls on channel
replacement, and reconnects after transport failure. Its public exports are `ready`, `context`,
`onContext`, `onDrop`, `onDrag`, and `call`.

## Native SDK

`native` implements the JSON-lines worker loop and exposes `serve`, `serve_with_release`, settings
helpers, and request types. Native plugins must depend only on the published SDK and approved
plugin libraries, never on the host runtime crate.

See [the plugin guide](../docs/plugins.md) for manifests and examples, and
[the capability specification](../docs/specs/plugin-capabilities.md) for the normative contract.

## Workshop presentation

Workshop reuses one composer for new and existing tasks. The welcome and sample drop area
becomes the conversation after creation; background polling preserves input focus and unchanged
model options. Start conversation creates and generates a text task immediately, while sample
selection creates a task first. Independent requirement analysis is absent from the task menu.
The menu dismisses on outside input, Escape, or action selection.

Task status sits beside the title; preview and install actions occupy the lower right. At widths
up to 900 CSS px the file rail is hidden, with generated files still available in the Files tab.
Deletion keeps a fixed column. Tool pages reserve a 1 CSS px bottom inset for fractional WebView2
viewport rounding. Automatic and manual Workshop previews share desktop environment arguments.

Provider management and runtime model selection are separate. Models are fetched explicitly or
added by ID and display name; legacy single-model configurations remain readable. Browsing
settings does not select or save. Valid changed configurations autosave after 600 ms, ignoring
stale completion feedback. Connection testing is explicit. AI service and optional global search
have separate cards with one page scroll region; SearXNG authentication is optional and Tavily
requires a key. Search feedback belongs in the card heading.

## Plugin availability and release labels

The host settings sidebar owns plugin ordering: captured pointer input keeps the row preview
inside the list, neighboring rows yield space, release persists ordering, and cancellation leaves
it unchanged. Arrow-key ordering remains available. Disabled items use dimmed names/icons and a
separate badge; trailing metadata has reserved columns and long names truncate with a tooltip.
Plugin-list installation, removal, and enablement update automatically without manual refresh.

The optional manifest field `beta: true` marks an experimental plugin. It defaults to false and
is copied into catalog entries. A shared Beta badge follows the version in catalog, recommended,
installed, and settings titles. It does not alter permissions, installation, or version semantics.
Preview empty, unsupported, and failure states link to plugin management rather than creating
Workshop tasks directly.

## Declared plugin shortcuts

The PDF plugin declares Left/Right page navigation and Up/Down scrolling with repeat enabled,
plus Home/End. The host binds and dispatches opaque IDs; PDF callbacks implement scrolling and
the 220ms continuous-mode page transition. Single-page navigation switches pages immediately.
Wheel/pointer input or vertical navigation interrupts a transition; reduced motion skips it.

After `await ready`, call `await shortcuts([{id: "save", key: "Ctrl+S", allowInInputs: true, run: save}])`.
The host validates and binds the list for that mount; a later call replaces it and `shortcuts([])`
unregisters it. Toolbar controls and shortcuts keep separate callback maps. The host delivers only
the opaque action ID; it never interprets the plugin operation.

Keys use `KeyboardEvent.key` names (`ArrowLeft`, `Enter`, `F1`, a letter or digit), optionally
prefixed by `Ctrl`, `Alt`, `Shift`, or `Meta` joined with `+`. Duplicate IDs or keys are rejected.
Escape, Space and Ctrl/Meta+O are reserved for the host. Inputs and repeated presses are excluded
unless `allowInInputs` or `repeat` is explicitly true. Composition and already handled keys are
excluded. Bindings are active only on a visible, interactive mount; modal host dialogs suspend
plugin shortcuts. A focused plugin iframe scopes dispatch to that mount. Reconnect republishes
the declaration; closing the channel removes the bindings.

Use this API for plugin commands such as saving or seeking. Text editing, search-field navigation
and control-local keyboard behavior still belong to the focused widget.

## License

The SDK is licensed under [Apache License 2.0](../LICENSE). Redistributed SDK files must retain the applicable license and attribution notices. Plugins may choose their own license for their original code.

Host application update checks are provided by the About page and are separate from plugin installation and SDK messaging. Plugins do not need an update-check capability.

### Shared state independent of parsing

Declare `"viewStateContract": "example.position/1"` in the manifest to share an opaque state group between plugins for the same file. This does not require `provides` or `consumes`. Without the new field, `viewState` still uses the existing data contract. Contract identifiers are at most 100 bytes and contain only ASCII letters, digits, or `.-/@`.

`await viewState()` reads the group (null when absent); `await viewState(value)` replaces the entire JSON group. Multiple related fields belong in one object. The host isolates groups by canonical file path and contract, accepts at most 4096 encoded bytes per group, retains at most 128 groups in memory, and evicts the least recently written group. State survives session recreation after saving or updating a plugin, but ends when the host exits. Plugins own the schema, validation, and versioning; draft document contents stay in the editor.

`await synchronizeState(get, restore)` restores on initial visibility and every later activation, waits for asynchronous restoration, flushes before hiding, and suppresses writes from hidden or restoring views. Its result provides `changed()`, `flush()`, and `dispose()`. Return undefined from `get()` until the view is ready. Restore errors reject initial setup; callers should handle them. The host treats the state as opaque.

```js
const sync = await synchronizeState(
  () => ({ page, x, y }),
  async value => { await restoreValidatedPosition(value); },
);
viewport.addEventListener("scroll", () => void sync.changed());
window.addEventListener("pagehide", () => { void sync.flush(); sync.dispose(); });
```
The official PDF preview and independent PDF editor use `ember.pdf-position/1` for page-relative reading state. The editor uses native draft RPCs through `call` and commits through `mutate` with `writeFile`; form inputs stay in the overlay. See the [PDF plugin contract](../docs/specs/pdf-plugins.md).

Plugin UI kit forms reuse `.ui-form`, `.ui-form-heading`, `.ui-form-help`, `.ui-form-group`, and `.ui-form-actions`. File pickers use `.ui-file` with an existing `.ui-button` and `.ui-file-name`; the plugin owns a hidden native file input and updates the name. Use `.ui-button.primary` for the primary action. These styles use host theme tokens, including focus and disabled states, without adding host business logic. PDF image corner handles remain document interaction owned by the editor; resizing commits one native draft operation on pointer release.

The host tracks initial view presentation separately from idle collection. Its 120-second presentation deadline starts only while the owning mount is visible, clears on hide/unmount, and ends with `presented()`. Inactive or never-mounted views do not time out while another plugin handles the current file; secondary panels cannot alter this timer. Plugins continue using the existing SDK lifecycle without a new declaration or heartbeat.

Host action pills use compact shadows with padding inside their horizontal scroll clip. This chrome spacing does not expand the reveal hit target: transparent gaps still belong to the plugin viewport. Plugin UI kit button styles are unchanged.

Scrollbar styling has one source in `web/scrollbars.css`, imported by host chrome and copied as `sdk-scrollbars.css` into plugin packages. Link `sdk-ui.css` to include it automatically, or link `sdk-scrollbars.css` for scrollbar styling alone. Both axes use an 8px transparent track, a rounded theme-token thumb with hover/active states, and no arrow buttons. Immersive host chrome leaves space outside this edge track, so floating controls do not cover scrollbar dragging.

Every official plugin entry links the shared UI stylesheet, including PDF and image views. Text surfaces do not override it with standard scrollbar properties that would suppress WebView2 pseudo-element styling.

Stateful editors must refresh native draft metadata when their view remounts instead of reusing opening metadata. Serialize renders with mutations and keep rejected selections recoverable. The PDF editor supports independent image width/height changes, with Shift preserving aspect ratio.

Workshop model selection captures the provider and model IDs before updating busy UI state. Its searchable picker is plugin-owned and does not change the Tool API.

Workshop polling preserves model-menu DOM nodes when the catalog and search query are unchanged; selection and availability update in place.

## PSD composite preview

The official PSD/PSB plugin uses existing native calls without extending the SDK. Open returns only header metadata; render caches a bounded RGBA composite and pixels transfers at most 512 KiB per call. Release removes the session cache. The view uses existing controls for zoom percentage, fit and actual size, with wheel zoom and pointer panning. Zoom is relative to document dimensions and reuses the sampled bitmap without further native reads; enlarging it does not add detail. The view background matches the image preview dot pattern. Pointer dragging uses bounded elastic overflow and a 280 ms return to the pan bounds; reduced-motion users return immediately. See [the PSD preview contract](../docs/specs/psd-preview.md) for supported formats and display limits.

## Read-only document helpers

`web/document.js` and `web/document.css` are optional plugin-side assets copied as `sdk-document.js` and `sdk-document.css`. `readDocument(read, size)` reads a validated document in 1 MiB chunks with a 64 MiB cap; `pageIndex`, `zoomFactor`, `fitDocument`, `rowWindow` and `lockDocumentLinks` support navigation, bounded virtual rows and read-only links. These helpers do not introduce a host command or protocol change. Native office plugins statically link `ember-office-document` for bounded OOXML validation; shared library updates ship with rebuilt plugins. See [office preview contract](../docs/specs/office-plugins.md).

## Plugin discovery categories

The optional manifest `category` field is copied into catalog entries. It is a lowercase ASCII token (letters, digits and hyphens), up to 40 bytes. The host displays `media`, `office`, `design`, `text`, `tools` and `other`; unknown or absent values appear under Other. Categories affect browsing only, never matching, activation, permissions or view priority. Existing uncategorized packages remain valid; packages declaring this field require a host that understands it because older hosts reject unknown manifest fields. See [plugin categories](../docs/plugins.md#插件分类).

The settings sidebar search indexes plugin display names, IDs and visible setting labels, help and option labels from existing manifest metadata. Chinese display metadata also supports toneless pinyin and initials (for example, shipin / spyl), alongside case-insensitive literal search. Content-keyed indexes are bounded and reused across runtime polls. Hidden settings, stored values and plugin-owned tool page content are excluded; no SDK API or manifest change is required.

The settings sidebar keeps a compact divider and search field; its placeholder explains search and drag ordering without an additional heading or hint row.

PSD previews use the existing `configuration()` / `onSettings()` channel for `fitWindow` and `frameWindow`, matching image plugin settings. Disabled framing sends an empty preparation; framing changes affect the next open, and manual pan/zoom takes precedence over live setting changes.

The host aligns bottom information and action pills at 40 CSS pixels. Preview minimum width follows the measured action row, including every plugin pill, host actions, gaps, and the measured information width (at least 120px), bounded to 320–800px and 80% of available screen width (the 320px baseline wins on smaller screens). Long rows remain horizontally scrollable with wheel/trackpad input and keyboard focus; below 480px, file information collapses to an icon with its full tooltip. Plugins keep publishing the same controls.

When an existing preview is narrower than the computed toolbar minimum, the host also enlarges its width while retaining height; setting the native minimum alone does not resize an existing Windows window. Wider windows remain unchanged.

Minimum-width changes may enlarge a preview once. Subsequent edge dragging is constrained natively without JavaScript resize correction. Information width uses intrinsic text measurements bounded to 120–200px, independent of the clipped current window.

Host actions occupy a non-shrinking sibling outside the plugin action scroller. Only plugin pills scroll when space is insufficient; host buttons remain fully visible and still count toward minimum-width measurement.

The measured toolbar minimum includes 12px of extra slack, subject to the overall cap.

Auto alignment margins are excluded from minimum-width measurements: unused space in a wider window never raises the minimum.

Bottom chrome pills have a 10px pointer tolerance to bridge small adjacent gaps. Large transparent spaces between groups still belong to the plugin; the whole footer never becomes a reveal target.

The narrow strip beneath the bottom pills through the window bottom also holds chrome visible, with scrollbar-side margins retained. It never extends upward into the large gap between information and actions.

Hosts may opt into passive bottom-edge pointer transitions with init.trackPointer; the SDK sends viewportPointer coordinates only on region changes. The host validates active-view bounds and decides chrome visibility. No input is captured or canceled; bottom scrollbar pixels remain owned by the view.

Immersive viewport layout and host chrome auto-hide are independent preferences. Auto-hide defaults on for existing users and appears only when immersive mode is enabled; turning immersive mode off preserves the preference. Disabling auto-hide keeps both floating bars visible without changing viewport geometry.

Image, PSD, and video frameWindow settings default to false; missing configuration also preserves the host window size. Explicit saved choices remain respected, and fitWindow defaults are unchanged.
