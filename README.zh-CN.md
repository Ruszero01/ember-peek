<div align="center">
  <img src="assets/brand/mark.svg" width="88" height="88" alt="Ember Peek 标志" />

  # Ember Peek

  轻量、快速、由插件驱动的 Windows 文件预览工具。

  在资源管理器中选中文件并按下 `Space`，即可预览文本、代码、Markdown、图片、视频、
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
| 视频预览 | 常见视频文件 | 播放、跳转、音量、帧导出与编码兼容 |
| 文本编辑 | 可写的文本和代码文件 | 搜索、保存、外部修改冲突保护 |
| 文件信息 | 任意本地文件 | 路径、大小和基础元数据 |
| 插件工坊（Beta） | 自定义文件格式 | AI 辅助生成、校验、试预览和安装 |

## 安装与使用

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

关闭预览窗口不会退出应用。窗口隐藏满 120 秒后会释放 WebView；托盘进程和资源管理器
监听仍会继续运行，并在下次预览时按需重建窗口。

## 插件

Ember Peek 宿主不包含任何特定格式的渲染器。文件解析、画面渲染以及文档引用的关联资源
都由插件处理；宿主只提供通用生命周期、权限、文件、关联资源和网络传输接口。

- 在「插件市场」中浏览、安装和更新插件。
- 在「插件管理」中启用、排序或卸载已安装插件。
- 同一个文件可以使用多个查看器，并通过预览窗口工具栏切换。
- 使用「插件工坊（Beta）」为自定义格式生成预览插件。
- 按照[插件开发指南](docs/plugins.md)开发第三方插件。

安装前会按声明的 SHA-256 和 `buildId` 校验插件包。当前尚未实现插件签名，请只配置可信
来源。原生插件与当前用户具有相同的系统权限。

## 插件工坊（Beta）

从「插件市场」安装工坊，再配置支持流式响应与工具调用的 OpenAI Chat Completions
兼容服务。手动获取模型列表，或添加模型 ID 和显示名称；在聊天输入区选择当前模型。
有效配置改动会自动保存。

描述需要的预览功能，可附加样例文件。工坊生成并校验插件，运行试预览，然后安装或导出
验证通过的结果。支持继续对话、取消生成和恢复先前验证过的版本。网络搜索可选，单独配置。

工坊为实验功能，兼容性取决于模型、服务和文件格式。AI 请求会将需求、对话和生成代码发送到
配置的服务；样例附件引用本机路径，不作为文件内容上传。

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

## 0.1.0 发布范围

首发面向 **Windows x64**，使用 WebView2。安装器不内置插件，首次安装推荐插件需要
联网；缺少 WebView2 时也可能需要联网安装。应用与插件版本独立发布。

资源管理器多选时预览第一项，文本编辑未保存草稿不提供崩溃后恢复。视频编码兼容可能需要
临时转码。当前 Windows 安装包未进行代码签名。

完整首发基线见 [0.1.0 更新日志](CHANGELOG.md)。

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
