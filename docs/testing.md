# 测试与质量门禁

## 自动化层次

| 层次 | 命令 | 覆盖范围 |
| --- | --- | --- |
| 格式 | `npm run format:check` | 全 workspace Rust 格式 |
| 静态检查 | `npm run lint` | 全 workspace、全部 target/feature 的 Clippy，warning 视为失败 |
| 前端构建 | `npm run build` | 图标目录同步、TypeScript、Vite 生产构建 |
| 插件构建 | `npm run plugins:build` | 清单、引用边界、JS 语法、native 版本、开发市场 |
| Node 测试 | `npm run test:js` | SDK、MessagePort、UI、工坊 Agent、发布和 ZIP 协议 |
| Rust 测试 | `npm run test:rust` | 文件写入、运行时、市场、生命周期、网络、工坊与原生插件 |
| 完整 CI | `npm run ci` | 版本、发布日志及上述全部门禁 |

测试应围绕公开行为和边界：清单输入输出、桥接消息、文件系统事务、网络策略、生成包内容。
只有布局结构无法通过行为接口观察时，才使用源码或 DOM 结构断言。

## CI 触发

`Baseline checks` 对 `dev`、`main` 的推送和以它们为目标的 Pull Request 运行，并支持手动
触发。插件发布与桌面发布再次执行同一个 `npm run ci`，然后才生成可发布产物。桌面安装包
只由 `Release Windows desktop` 构建，避免普通 CI 重复耗时打包。

## 手动 Windows 验收

自动化无法替代以下系统集成检查：

1. Explorer 单窗口多标签页、多个窗口、地址栏/搜索框/F2 重命名下的空格键行为。
2. 托盘、首次启动、窗口隐藏与 120 秒 WebView2 回收。
3. 插件安装、覆盖更新、卸载，以及有未保存内容时的拒绝路径。
4. 真实拖放、文件选择、剪贴板、主题和语言切换。
5. 工坊真实模型供应商、取消、断网恢复、试预览窗口和截图回传。
6. Markdown 的 `./`、`../`、绝对路径、`file:` 与公开 HTTP(S) 图片；失败资源应降级而不
   破坏正文。

运行手动验收时使用已有开发服务器，不在自动化脚本中隐式启动或停止它。

## 当前覆盖缺口

- Windows Explorer COM/UI Automation 与全局键盘钩子只能在真实桌面会话验证。
- WebView2 媒体解码能力取决于系统运行时和编解码器。
- 两个真实模型供应商测试默认 `ignored`，仅在显式提供凭据和地址时运行。
- 尚未设行覆盖率百分比门槛；当前以协议分支、失败路径和回归用例完整性作为合并标准。
