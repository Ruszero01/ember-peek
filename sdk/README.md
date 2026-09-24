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
| Diagnostics and clipboard | `diagnosticsOf`, `clipboard` |

View theme tokens include `--viewport-mode`: `window` when the view occupies the entire preview window (immersive mode), or `content` when it sits between the host bars. `--safe-top` and `--safe-bottom` remain available for scrollable content and controls that must avoid the floating bars.

`read()` is capped at 1 MiB per call. `fileUrl()` serves the current file up to 32 MiB.
`streamUrl()` is the format-neutral large-file path: a browser-native consumer requests byte
ranges and the host answers in bounded chunks, so playback or parsing can begin without first
copying the whole file into WebView memory.
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
