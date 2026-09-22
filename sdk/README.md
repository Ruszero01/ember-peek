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
| Host UI | `controls`, `status`, `panel`, `findIcons`, `createIcon` |
| Current file | `read`, `fileUrl`, `fileBlob` |
| Linked resources | `resourceUrl`, `resourceBlob` (requires `readResources`) |
| Native/source calls | `call`, `mutate`, `sourceCall` |
| Settings | `configuration`, `onSettings`, `setSetting` |
| Language/theme | `locale`, `onLocale`, `translate`, `onTheme` |
| View/panel coordination | `postTo`, `onMessage`, `viewState` |
| Diagnostics and clipboard | `diagnosticsOf`, `clipboard` |

`read()` is capped at 1 MiB per call. `fileUrl()` serves the current file up to 32 MiB.
`resourceUrl()` resolves paths relative to the current document (including `../`, absolute paths,
and `file:` URLs) or proxies public HTTP(S) resources. Each linked resource is capped at 64 MiB;
private, loopback, and link-local network targets are rejected. Use `resourceBlob()` when a parser
needs bytes or a media element requires a `blob:` URL.

The SDK rejects pending requests immediately when its MessagePort is replaced. Requests otherwise
use the host protocol timeout because native parsing may legitimately run for up to 120 seconds.

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
