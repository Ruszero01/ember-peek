<div align="center">
  <img src="assets/brand/mark.svg" width="88" height="88" alt="Ember Peek logo" />

  # Ember Peek

  A fast, lightweight, plugin-driven file previewer for Windows.

  Select a file in File Explorer and press `Space` to preview text, source code,
  Markdown, images, PDFs, videos, metadata, and formats supported by installed plugins.

  [![Windows](https://img.shields.io/badge/Windows-2f6fed?style=flat-square&logo=windows11&logoColor=white)](https://github.com/Ruszero01/ember-peek/releases)
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
More plugins will extend support to additional file formats in the future.

| Capability | Typical files | Highlights |
| --- | --- | --- |
| Plain-text preview | TXT, logs, configuration files | Encoding detection, line numbers, wrapping |
| Source-code preview | Common programming languages | Syntax highlighting, virtualized long documents |
| Markdown preview | READMEs, notes, documentation | Render/source modes, outline, linked local and remote images |
| Image preview | PNG, JPEG, GIF, WebP, BMP, AVIF, SVG | Zoom, pan, fit to window |
| PDF preview | PDF documents | Page navigation, zoom, fill window, rotation |
| PDF editor (Beta) | PDF documents | Edit text fragments, replace/resize images, add/delete pages, undo, save |
| Video preview | Common video files | Playback, seeking, volume, frame export, codec compatibility |
| Text editing | Writable text and source files | Search, save, external-change protection |
| File information | Any local file | Path, size, and basic metadata |
| Plugin Workshop (Beta) | Custom file formats | AI-assisted generation, validation, trial preview, and installation |

## Installation and use

Ember Peek runs on Windows 11 x64. The installer takes care of the components needed to run it.
Install plugins from the online marketplace, then preview and edit files locally.

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

Closing the preview window hides it while Ember Peek stays available in the tray.
Hidden windows release resources automatically and reopen when you need them.

## Plugins

Each plugin adds its own preview or editing experience. Install the viewers you need,
and choose between them when a file supports more than one.

- Browse, install, and update plugins in **Plugin Marketplace**.
- Enable, order, or remove installed plugins in **Plugin Management**.
- Use multiple viewers for one file and switch between them from the preview toolbar.
- Generate a viewer for a custom format with **Plugin Workshop (Beta)**.
- Build third-party plugins with the [plugin development guide](docs/plugins.md).

Plugin packages are verified automatically before installation.

## Plugin Workshop (Beta)

Install the Workshop from **Plugin Marketplace**, then configure an OpenAI Chat Completions
compatible AI service. Fetch the available models or add your own, then search and choose a
model in the chat composer. Configuration changes save automatically.

Describe the preview you need and optionally attach a sample file. Workshop generates and
validates a plugin, runs a trial preview, and lets you install or export the verified result.
You can continue the conversation, cancel generation, or restore an earlier verified build.
Network search is optional and configured separately.

Workshop uses the AI service you configure. Requests include your requirements, conversation,
and generated code; sample files stay on your computer.

## PDF preview and editing

Install PDF Preview for single-page or continuous reading, page navigation, zoom, rotation,
and a choice of filling the window or showing the entire page. PDF Preview and PDF Editor
share the reading position when you switch between them.

Switch to PDF Editor (Beta) to select and edit text fragments, replace or resize images,
and insert or delete pages. Changes stay in a draft until you save, with undo and protection
against external file changes. Drag an image corner to resize it, or hold Shift to preserve
its proportions.

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

## License

The host, official plugins, and SDK are licensed under [Apache License 2.0](LICENSE). Third-party components retain their own licenses. The separately maintained official website is not included in this license grant.
