# Contributing to Ember Peek

Ember Peek targets Windows 11 and keeps the desktop host format-agnostic. A change that only
benefits one file format normally belongs in a plugin; the host should expose reusable lifecycle,
permission, transport, and presentation primitives.

## Development environment

- Windows 11 with Microsoft Edge WebView2
- Node.js 22 and `npm ci`
- Stable Rust with `rustfmt` and `clippy`

Use `npm run dev` for the normal development loop. The command builds the local plugin mirror,
starts Vite and Tauri, and watches plugin sources. Do not run a second development server against
the same checkout.

## Required checks

Run these before opening a pull request:

```powershell
npm run check
npm test
```

`npm run check` enforces Rust formatting and Clippy warnings, verifies generated icons, type-checks
and builds the frontend, and packages every official plugin. `npm test` runs the Node protocol,
packaging, UI, SDK, and release tests followed by all Rust suites. The CI entry point is
`npm run ci`; workflows call the same script instead of maintaining a second list of checks.

Explorer hooks, tray behavior, WebView2 lifetime, drag and drop, and real model providers require
the manual Windows matrix in [docs/testing.md](docs/testing.md).

## Change boundaries

- Keep the host unaware of document formats and plugin-specific controls.
- Preserve existing manifest `api` behavior. Additive SDK exports are compatible; removing or
  changing an export requires a new protocol version and a documented migration.
- Treat package files, documents, model output, web pages, and plugin messages as untrusted data.
- Add a regression test with every bug fix. Prefer testing the narrow protocol boundary over
  asserting implementation text.
- Do not commit generated `dist`, `.marketplace`, `.plugins`, or local credential files.

## Documentation and releases

- Public project information is English-first in `README.md`; `README.zh-CN.md` mirrors it in
  Simplified Chinese.
- Architecture and protocol changes must update the relevant file under `docs/` and the SDK
  reference in [sdk/README.md](sdk/README.md).
- Add user-visible changes to `CHANGELOG.md` under `[Unreleased]` using Added, Changed, Fixed, or
  Security. At release time, move entries into the target version section.
- Application and workspace versions are synchronized with `npm run version:set -- <version>` and
  verified with `npm run version:check`. Plugin versions are independent and must be bumped when a
  changed package is published.

## Commits

Keep commits focused and use an imperative Conventional Commit-style subject where practical,
for example `fix: reject requests on bridge replacement`. Pull requests should describe the user
impact, compatibility implications, automated checks, and any manual Windows verification.
