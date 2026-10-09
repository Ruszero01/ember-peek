<div align="center">
  <img src="assets/brand/mark.svg" width="88" height="88" alt="Ember Peek 标志" />

  # Ember Peek

  轻量、快速、由插件驱动的 Windows 文件预览工具。

  在资源管理器中选中文件并按下 `Space`，即可预览文本、代码、Markdown、图片、PDF、视频、
  文件信息以及已安装插件支持的其他格式。

  [![Windows](https://img.shields.io/badge/Windows-2f6fed?style=flat-square&logo=windows11&logoColor=white)](https://github.com/Ruszero01/ember-peek/releases)
  [![Release](https://img.shields.io/github/v/release/Ruszero01/ember-peek?display_name=tag&style=flat-square&color=b7572f)](https://github.com/Ruszero01/ember-peek/releases/latest)
  [![Downloads](https://img.shields.io/github/downloads/Ruszero01/ember-peek/total?style=flat-square&color=f4a477)](https://github.com/Ruszero01/ember-peek/releases)
  [![Tauri 2](https://img.shields.io/badge/Tauri-2-24c8d8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)

  [下载最新版](https://github.com/Ruszero01/ember-peek/releases/latest) · [开始使用](#安装与使用) · [问题反馈](https://github.com/Ruszero01/ember-peek/issues)

  [English](README.md) · **简体中文**
</div>

---

## 功能概览

Ember Peek 常驻 Windows 系统托盘，仅在资源管理器文件列表获得焦点时响应空格键。
预览和编辑能力由独立插件提供，因此宿主保持轻量，用户只需安装自己需要的功能。
未来将提供更多插件，支持更多文件格式。

| 能力 | 适用内容 | 主要功能 |
| --- | --- | --- |
| 纯文本预览 | TXT、日志、配置文件等 | 编码识别、行号、自动换行 |
| 代码预览 | 常见编程语言源码 | 语法高亮、长文档虚拟化 |
| Markdown 预览 | README、笔记、说明文档 | 渲染与源码切换、大纲、本地及远程关联图片 |
| 图片预览 | PNG、JPEG、GIF、WebP、BMP、AVIF、SVG | 缩放、拖动、适应窗口 |
| PDF 预览 | PDF 文档 | 翻页、缩放、适配窗口、旋转 |
| PDF 编辑（Beta） | PDF 文档 | 编辑文字片段、替换／缩放图片、增删页、撤销、保存 |
| 视频预览 | 常见视频文件 | 播放、跳转、音量、帧导出与编码兼容 |
| 文本编辑 | 可写的文本和代码文件 | 搜索、保存、外部修改冲突保护 |
| 文件信息 | 任意本地文件 | 路径、大小和基础元数据 |
| 插件工坊（Beta） | 自定义文件格式 | AI 辅助生成、校验、试预览和安装 |

## 安装与使用

Ember Peek 适用于 Windows 11 x64，安装器会准备运行所需的组件。
从在线市场安装插件后，即可在本机预览和编辑文件。

1. 从 [GitHub Releases](https://github.com/Ruszero01/ember-peek/releases/latest) 下载最新 Windows 安装包。
2. 完成安装并启动 Ember Peek。
3. 在首次启动页面选择推荐插件，也可以稍后在「设置 → 插件市场」中安装。
4. 在 Windows 资源管理器中选中文件，然后按下 `Space`。

Ember Peek 不会拦截地址栏、搜索框、重命名输入框或其他应用中的空格键。

| 操作 | 快捷键或入口 |
| --- | --- |
| 显示或隐藏当前文件预览 | `Space` |
| 隐藏预览窗口 | `Esc` |
| 从预览窗口选择文件 | `Ctrl` + `O` |
| 保存文本编辑内容 | `Ctrl` + `S` |
| 打开设置 | 托盘图标 →「设置」 |
| 完全退出 | 托盘图标 →「退出」 |

关闭预览窗口后，Ember Peek 仍会在托盘中待命。隐藏的窗口会自动释放资源，
下次需要时重新打开。

## 插件

每个插件提供独立的预览或编辑体验。按需安装查看器，
同一个文件有多种查看方式时，可以随时切换。

- 在「插件市场」中浏览、安装和更新插件。
- 在「插件管理」中启用、排序或卸载已安装插件。
- 同一个文件可以使用多个查看器，并通过预览窗口工具栏切换。
- 使用「插件工坊（Beta）」为自定义格式生成预览插件。
- 按照[插件开发指南](docs/plugins.md)开发第三方插件。

插件包会在安装前自动完成校验。

## 插件工坊（Beta）

从「插件市场」安装工坊，再连接自己的 OpenAI 兼容 AI 服务。
获取可用模型或手动添加，在聊天输入区搜索并选择当前模型；配置改动会自动保存。

描述需要的预览功能，可附加样例文件。工坊生成并校验插件，运行试预览，然后安装或导出
验证通过的结果。支持继续对话、取消生成和恢复先前验证过的版本。网络搜索可选，单独配置。

工坊使用你配置的 AI 服务，需求、对话和生成代码会发送给该服务；样例文件保留在本机。

## PDF 预览与编辑

安装 PDF 预览后，可使用单页或连续阅读、翻页、缩放、旋转，并选择铺满窗口或完整显示
整页。切换 PDF 预览与 PDF 编辑时，会保留当前阅读位置。

切换到 PDF 编辑（Beta），即可选择并修改文字片段、替换或缩放图片、插入或删除页面。
修改先保留为草稿，保存时才写入文件，支持撤销和外部修改冲突保护。
拖动图片四角可调整大小，按住 Shift 可保持原有比例。

## 文件安全与隐私

文本编辑插件支持 UTF-8、UTF-16 LE 和 UTF-16 BE，保存时保留原始编码；如果文件在编辑
期间被其他程序修改，保存会被拒绝。存在未保存内容时，相关插件不会在未经确认的情况下
被替换、停用、回收或卸载。

预览和编辑均在本机完成。Ember Peek 可能下载插件包以及文档明确引用的公开资源，但不会
上传当前打开的文件。

## 界面

- 浅色、深色和跟随系统主题。
- English、简体中文和跟随系统语言。
- 沉浸预览模式。
- 插件声明的开关、数字、下拉框、文本和目录设置。

主题和语言切换会同步到设置页、预览窗口、托盘菜单以及已经打开的插件视图。

## 开发

请先阅读[贡献指南](CONTRIBUTING.md)，再按需查看[插件开发](docs/plugins.md)、
[SDK 契约](sdk/README.md)、[系统架构](docs/architecture.md)、[测试规范](docs/testing.md)和
[Windows 打包](docs/windows-desktop.md)。面向用户的改动统一记录在[更新日志](CHANGELOG.md)。

## 问题反馈

请通过 [GitHub Issues](https://github.com/Ruszero01/ember-peek/issues) 提交问题，并尽量提供
Windows 与 Ember Peek 版本、文件类型和大小、相关插件版本以及复现步骤。请勿上传包含
隐私或敏感内容的文件。

## 许可证

宿主、官方插件和 SDK 使用 [Apache License 2.0](LICENSE)。第三方组件保留各自许可证。独立维护的官网不包含在此授权范围内。
