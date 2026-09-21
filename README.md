<div align="center">
  <img src="assets/brand/mark.svg" width="88" height="88" alt="Ember Peek Logo" />

  # Ember Peek

  Windows 文件快速预览工具

  在资源管理器中选中文件并按下 `Space`，即可预览文本、代码、Markdown、图片和文件信息。

  [![Windows 11](https://img.shields.io/badge/Windows-11-2f6fed?style=flat-square&logo=windows11&logoColor=white)](https://github.com/Ruszero01/ember-peek/releases)
  [![Release](https://img.shields.io/github/v/release/Ruszero01/ember-peek?display_name=tag&style=flat-square&color=b7572f)](https://github.com/Ruszero01/ember-peek/releases/latest)
  [![Downloads](https://img.shields.io/github/downloads/Ruszero01/ember-peek/total?style=flat-square&color=f4a477)](https://github.com/Ruszero01/ember-peek/releases)
  [![Tauri 2](https://img.shields.io/badge/Tauri-2-24c8d8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)

  [下载最新版](https://github.com/Ruszero01/ember-peek/releases/latest) · [使用说明](#安装与使用) · [问题反馈](https://github.com/Ruszero01/ember-peek/issues)
</div>

---

## 功能概览

Ember Peek 是一款面向 Windows 11 的桌面文件预览工具。应用常驻系统托盘，在 Windows 资源管理器的文件列表中响应空格键，并按需创建预览窗口。

具体的预览和编辑能力由插件提供。用户可以只安装需要的插件，也可以为同一个文件同时启用多种查看方式。

### 当前支持的能力

| 能力 | 适用内容 | 主要功能 |
| --- | --- | --- |
| 纯文本预览 | TXT、日志、配置文件等 | 编码识别、行号、自动换行 |
| 代码预览 | 常见编程语言源码 | 语法高亮、长文档虚拟化 |
| Markdown 预览 | README、笔记、说明文档 | 渲染与源码切换、跟随大纲 |
| 图片预览 | PNG、JPEG、GIF、WebP、BMP、AVIF、SVG | 缩放、拖动、适应窗口 |
| 文本编辑 | 可写的文本和代码文件 | 搜索、保存、外部修改冲突保护 |
| 文件信息 | 任意本地文件 | 路径、大小和基础元数据 |

## 安装与使用

1. 从 [GitHub Releases](https://github.com/Ruszero01/ember-peek/releases/latest) 下载最新的 Windows 安装包。
2. 完成安装并启动 Ember Peek。
3. 在首次启动页面选择需要的推荐插件。也可以稍后在「设置 → 插件市场」中安装。
4. 在 Windows 资源管理器中选中文件，然后按下 `Space`。

Ember Peek 仅在资源管理器的文件列表具有焦点时响应空格键，不会处理地址栏、搜索框、重命名输入框或其他应用中的键盘输入。

### 常用操作

| 操作 | 快捷键或入口 |
| --- | --- |
| 显示或隐藏当前文件预览 | `Space` |
| 隐藏预览窗口 | `Esc` |
| 从预览窗口选择文件 | `Ctrl` + `O` |
| 保存文本编辑内容 | `Ctrl` + `S` |
| 打开设置 | 右键托盘图标 →「设置」 |
| 完全退出 | 右键托盘图标 →「退出」 |

关闭预览窗口不会退出应用。窗口隐藏满 120 秒后，其 WebView 会被销毁以释放资源；托盘与资源管理器监听仍会继续运行，并在下次预览时重新创建窗口。

## 插件管理

Ember Peek 本体不包含具体的文件渲染器。文本、代码、Markdown、图片和文件信息等能力均由独立插件提供。

- 在「插件市场」中浏览、搜索、安装和更新插件。
- 在「插件管理」中启用、排序或卸载已安装插件。
- 插件排序决定自动激活优先级，位置越靠上优先级越高。
- 同一个文件可以匹配多个插件，并通过预览窗口底部工具栏切换。
- 具有未保存内容的插件视图会保持挂载，并阻止相关插件被覆盖更新。

插件包安装前会校验 `SHA-256` 和 `buildId`。当前版本不支持插件签名；配置插件源时，请确认来源可信。

## 文本编辑与文件安全

文本编辑插件支持 UTF-8、UTF-16 LE 和 UTF-16 BE。保存时会保留原始编码，并统一文件中的换行格式。

为避免意外覆盖：

- 如果文件在编辑期间被其他程序修改，保存操作会被拒绝。
- 未保存的编辑会阻止插件会话被闲置回收。
- 应用退出时，如果存在未保存内容，会先显示确认提示。
- 插件更新影响到未保存的会话时，更新操作会被拒绝。

预览和编辑均在本机完成。插件包会从配置的插件源下载，但文件内容不会因此上传。

## 界面设置

- 主题：浅色、深色、跟随系统。
- 界面语言：简体中文、English、跟随系统。
- 沉浸模式：让当前插件视图填满预览窗口。
- 插件设置：插件可以声明自己的开关、数字、下拉框或文本配置项。

主题和语言切换会同步应用到设置窗口、预览窗口、托盘菜单以及已打开的插件视图。

## 常见问题

<details>
<summary><strong>安装后无法预览文件</strong></summary>

Ember Peek 本体不包含预览器。请打开「设置 → 插件市场」，安装与文件类型对应的插件。
</details>

<details>
<summary><strong>按下空格没有反应</strong></summary>

请确认：

- Ember Peek 正在系统托盘中运行；
- 焦点位于 Windows 资源管理器的文件列表；
- 当前选中项具有本地文件系统路径；
- 已安装与该文件类型匹配的插件。

资源管理器中的虚拟项目和没有本地路径的条目不会触发预览。
</details>

<details>
<summary><strong>关闭窗口后托盘图标仍然存在</strong></summary>

这是正常行为。关闭按钮只隐藏窗口，以便继续响应资源管理器中的预览操作。如需停止应用，请在托盘菜单中选择「退出」。
</details>

<details>
<summary><strong>一个文件出现多个预览选项</strong></summary>

同一个文件可以由多个插件处理。例如 Markdown 文件可以使用渲染预览、源码预览或文本编辑。可以通过窗口底部的插件按钮切换当前视图。
</details>

## 系统要求

- Windows 11
- Microsoft Edge WebView2 Runtime

## 问题反馈

请通过 [GitHub Issues](https://github.com/Ruszero01/ember-peek/issues) 提交问题。建议提供以下信息：

- Windows 版本；
- Ember Peek 版本；
- 文件类型和大小；
- 已安装的相关插件及其版本；
- 可复现问题的操作步骤。

请勿上传包含隐私或敏感内容的文件。

## 开发文档

以下内容面向插件作者和项目贡献者：

- [插件开发指南](docs/plugins.md)
- [系统架构](docs/architecture.md)
- [Windows 桌面与发布说明](docs/windows-desktop.md)
- [插件能力规范](docs/specs/plugin-capabilities.md)
- [文本插件规范](docs/specs/text-plugins.md)

## GitHub Topics

建议为仓库配置以下 Topics：

`windows-11` `file-preview` `quick-look` `tauri` `rust` `react` `plugin-system` `markdown-preview` `code-preview` `image-viewer` `desktop-app` `productivity`
