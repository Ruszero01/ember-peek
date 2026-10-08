<div align="center">
  <img src="assets/brand/mark.svg" width="88" height="88" alt="Ember Peek logo" />

  # Ember Peek

  A fast, lightweight, plugin-driven file previewer for Windows 11.

  Select a file in File Explorer and press `Space` to preview text, source code,
  Markdown, images, videos, metadata, and formats supported by installed plugins.

  [![Windows 11](https://img.shields.io/badge/Windows-11-2f6fed?style=flat-square&logo=windows11&logoColor=white)](https://github.com/Ruszero01/ember-peek/releases)
  [![Release](https://img.shields.io/github/v/release/Ruszero01/ember-peek?display_name=tag&style=flat-square&color=b7572f)](https://github.com/Ruszero01/ember-peek/releases/latest)
  [![Downloads](https://img.shields.io/github/downloads/Ruszero01/ember-peek/total?style=flat-square&color=f4a477)](https://github.com/Ruszero01/ember-peek/releases)
  [![Tauri 2](https://img.shields.io/badge/Tauri-2-24c8d8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)

  [Download](https://github.com/Ruszero01/ember-peek/releases/latest) · [Get started](#installation-and-use) · [Report an issue](https://github.com/Ruszero01/ember-peek/issues)

  **English** · [简体中文](README.zh-CN.md)
</div>

---

## Overview

Ember Peek runs in the Windows system tray and responds to the Space key only when the
File Explorer file list has focus. Preview and editing features are supplied by independent
plugins, so the host stays small and users install only the capabilities they need.

| Capability | Typical files | Highlights |
| --- | --- | --- |
| Plain-text preview | TXT, logs, configuration files | Encoding detection, line numbers, wrapping |
| Source-code preview | Common programming languages | Syntax highlighting, virtualized long documents |
| Markdown preview | READMEs, notes, documentation | Render/source modes, outline, linked local and remote images |
| Image preview | PNG, JPEG, GIF, WebP, BMP, AVIF, SVG | Zoom, pan, fit to window |
| Video preview | Common video files | Playback, seeking, volume, frame export, codec compatibility |
| Text editing | Writable text and source files | Search, save, external-change protection |
| File information | Any local file | Path, size, and basic metadata |
| Plugin Workshop (Beta) | Custom file formats | AI-assisted generation, validation, trial preview, and installation |

## Installation and use

1. Download the latest Windows installer from [GitHub Releases](https://github.com/Ruszero01/ember-peek/releases/latest).
2. Install and launch Ember Peek.
3. Choose the recommended plugins during onboarding, or install them later from
   **Settings → Plugin Marketplace**.
4. Select a file in Windows File Explorer and press `Space`.

Ember Peek does not intercept Space in the address bar, search field, rename editor, or
other applications.

| Action | Shortcut or entry point |
| --- | --- |
| Show or hide the selected file | `Space` |
| Hide the preview window | `Esc` |
| Choose a file from the preview window | `Ctrl` + `O` |
| Save in the text editor | `Ctrl` + `S` |
| Open settings | Tray icon → **Settings** |
| Exit completely | Tray icon → **Exit** |

Closing the preview window hides it rather than exiting the app. After 120 seconds hidden,
its WebView is released; the tray process and Explorer listener remain active and recreate
the window on demand.

## Plugins

The Ember Peek host contains no format-specific renderer. Plugins own parsing and rendering,
including linked resources required by a document. The host provides generic lifecycle,
permission, file, resource, and network transport APIs.

- Browse, install, and update plugins in **Plugin Marketplace**.
- Enable, order, or remove installed plugins in **Plugin Management**.
- Use multiple viewers for one file and switch between them from the preview toolbar.
- Generate a viewer for a custom format with **Plugin Workshop (Beta)**.
- Build third-party plugins with the [plugin development guide](docs/plugins.md).

Plugin packages are checked against their declared SHA-256 and `buildId` before installation.
Plugin signing is not implemented yet, so only configure sources you trust. Native plugins
run with the current user's permissions.

## Plugin Workshop (Beta)

Install the Workshop from **Plugin Marketplace**, then configure an OpenAI Chat Completions
compatible service with streaming and tool calling. Fetch models manually or add a model ID
and display name; choose the active model in the chat composer. Valid configuration changes
save automatically.

Describe the preview you need and optionally attach a sample file. Workshop generates and
validates a plugin, runs a trial preview, and lets you install or export the verified result.
You can continue the conversation, cancel generation, or restore an earlier verified build.
Network search is optional and configured separately.

Workshop is experimental. Compatibility depends on the model, service, and file format.
AI requests send your requirements, conversation, and generated code to the configured service;
sample attachments are referenced by local path rather than uploaded as file contents.

## File safety and privacy

The text editor supports UTF-8, UTF-16 LE, and UTF-16 BE. It preserves the original encoding
when saving and refuses to overwrite a file changed by another program. Unsaved work prevents
the affected plugin from being replaced, disabled, reclaimed, or removed without confirmation.

Previewing and editing happen locally. Ember Peek may download plugin packages and public
resources explicitly referenced by a document, but it does not upload the opened file.

## Interface

- Light, dark, and system themes.
- English, Simplified Chinese, and system language selection.
- Immersive preview mode.
- Plugin-defined toggle, number, select, text, and folder settings.

Theme and language changes are propagated to settings, preview windows, tray menus, and open
plugin views.

## 0.1.0 release scope

The first release targets **Windows 11 x64** and uses WebView2. The installer does not bundle
plugins; installing recommended plugins initially requires internet access. WebView2 may also
need an online installation if it is missing. Application and plugin versions are independent.

Text previews truncate above 2 MiB and become read-only; image previews are limited to 32 MiB.
There are no official PDF, PSD, or FBX viewers yet. Explorer multi-selection previews the first
file. Unsaved text-editor drafts are not recovered after a crash. Video codec compatibility may
require temporary transcoding. The Windows installer is not code-signed.

See the [0.1.0 changelog](CHANGELOG.md) for the complete release baseline.

## Development

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then use the focused references for
[plugin development](docs/plugins.md), [SDK contracts](sdk/README.md),
[architecture](docs/architecture.md), [testing](docs/testing.md), and
[Windows packaging](docs/windows-desktop.md). User-visible changes are tracked in the
[changelog](CHANGELOG.md).

## Reporting issues

Please use [GitHub Issues](https://github.com/Ruszero01/ember-peek/issues) and include the
Windows and Ember Peek versions, file type and size, relevant plugin versions, and reproduction
steps. Do not upload files containing private or sensitive information.
