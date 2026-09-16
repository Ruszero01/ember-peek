# Windows 托盘、窗口和 Explorer 集成

## 入口与职责

- `src-tauri/src/desktop.rs`：原生托盘、两个窗口、选择请求版本号、关闭与闲置回收。
- `src-tauri/src/explorer.rs`：Windows 低级键盘钩子和独立 COM 选择读取线程；不依赖 WebView 存活。
- `src-tauri/src/main.rs`：注册通用命令、初始化插件运行时、退出清理和周期回收。
- `src/main.tsx`：按 URL 的 `window=preview/settings` 选择窗口界面。设置窗口不挂载插件视图。

启动只创建原生托盘。预览窗口标签为 `preview`，设置窗口为 `settings`；它们独立显示和回收，仍共享一个 Rust 插件运行时与主题偏好。不是每次预览都新建一个窗口：所有文件复用预览窗口，切换会话时保留后台插件任务。

右键菜单是“设置”和“退出”；debug 构建多出“重置为首次启动”，它把运行时恢复到首次启动状态（卸载全部插件、清空记住的选择与 `onboarded`、删除包目录），随后直接打开首启引导页。有未保存草稿时它会拒绝并在对话框里说明，与卸载一致。发行构建不注册这一项。左键双击清空当前选择并显示预览；右键“设置”显示独立设置窗口。关闭按钮与 Alt+F4 被转换为隐藏。Escape 隐藏窗口（插件浮层里的 Escape 由插件自己处理，不会传到宿主）；内容区域的无修饰空格也隐藏预览。插件 SDK 转发这些快捷键，输入框、可编辑内容和按钮保留正常空格行为。

## 闲置回收

每个窗口隐藏时记录 `Instant`，原生两秒维护周期检查是否达到 120 秒。再次显示取消该窗口的回收计时。窗口可见时即使用户没有操作也不回收；最小化仍属于可见窗口。

到期调用 Tauri `WebviewWindow::destroy()`，关闭该窗口对应的 WebView2 controller，不按进程名称终止 `msedgewebview2.exe`。当本应用最后一个 WebView 被关闭，WebView2 自行释放共享浏览器实例；若设置仍然打开，共享浏览器仍会存在，属于正常行为。实际进程退出时刻由 WebView2 管理，不保证恰好在第 120 秒消失。

隐藏预览会解除插件运行时的 active 引用，但不会取消正在运行的原生加载。窗口回收与插件进程回收是两个独立生命周期。插件加载完成后，没有重新使用的会话按运行时 TTL 回收；重新打开时可以利用仍有效的缓存，也可以创建新会话。已经销毁的网页视图会重新初始化。

无窗口导致的 Tauri `ExitRequested` 被阻止；显式退出和开发重启保留原有语义。托盘“退出”会停止键盘监听并关闭全部插件进程。宿主 Rust 热重载仍是重编译加整进程重启，不保留内存会话。

## 当前标签页选择

1. `WH_KEYBOARD_LL` 只处理真实的无修饰空格，忽略注入输入；按住不重复触发。
2. 回调检查前台窗口是 `CabinetWClass` 或 `ExploreWClass`，并读取该线程的焦点窗口。焦点必须位于可见的 `SHELLDLL_DefView` 文件视图之内，沿父链遇到编辑控件则放行；菜单等交互状态也放行。
3. 将前台窗口、文件视图、焦点句柄交给容量为 1 的线程通道。钩子不调用 COM、不读取文件、不创建窗口。
4. 独立 COM 线程再次核对焦点，并用 Windows UI Automation 排除编辑框和组合框。枚举 `IShellWindows`，通过 `IServiceProvider → SID_STopLevelBrowser → IShellBrowser::QueryActiveShellView` 取得实际文件视图。
5. 只有视图 HWND 与按键时的可见文件视图一致，且所属根窗口仍为同一前台 Explorer 窗口，才读取 `IFolderView2::GetSelection(false)`。**不会仅凭顶层 HWND 或枚举顺序匹配标签页**。
6. 将第一项转换为 `SIGDN_FILESYSPATH`。读取完成和主事件循环派发时再次核对焦点；期间切换标签页或应用就丢弃过期结果。确认后交给通用插件运行时，不按文件格式写分支。

Shell COM 调用失败或没有当前视图匹配时不退回其他标签页。桌面图标、第三方文件管理器、虚拟无路径项不在此最小原型范围。Windows 的内部文件视图层级若变更，会保守地不触发，而不是猜测其他标签页。

Windows 上动态创建 WebView 使用独立阻塞线程，并以创建锁避免重复标签；不在同步命令或事件回调里调用窗口构造器，规避 WebView2 死锁。最终显示、隐藏与销毁派发到主事件循环，显示前再次检查请求版本；创建过程中失效的隐藏窗口仍会进入回收队列。插件打开请求在异步运行时处理。请求版本号用于防止旧打开结果覆盖新选择或关闭动作。前端从原生快照同步 active 会话，事件立即触发刷新，并以定时快照兜底；冷启动 WebView 不依赖“碰巧收到”一次性打开事件。

## 手动验收

这些步骤需要你运行 `npm run dev` 后检查；编译通过不能代替 Explorer 与 WebView2 的实际交互验证。

1. 启动后检查托盘存在：首次启动（`host-state.json` 里 `onboarded` 为 false）会打开一次引导页，之后启动不再有自动弹出的网页窗口；右键菜单在发行构建里只有设置和退出。
2. 双击打开空预览；打开设置，确认两个窗口独立，并验证主题同步。
3. 在设置安装文本、图片插件。Explorer 新建两个标签页，分别选中不同文件；来回切换后按空格，应始终预览当前标签页选中的文件。
4. 再开第二个 Explorer 窗口，验证跟随前台窗口；在同一个目录开两个标签页，验证不根据路径或标题混淆选择。
5. 地址栏、搜索框、F2 重命名输入、右键菜单和其他应用内输入空格应保持原行为；Ctrl/Shift/Alt/Win + 空格不触发预览。
6. 长按空格只打开一次，松开后在预览内容区域再次按空格隐藏。验证 Escape 和关闭按钮隐藏到托盘。
7. 加载时立即切换文件或关闭窗口，确认原生加载继续；重新打开不被更早的结果抢回。
8. 关闭两个窗口，等待约 122 秒以上，查看本应用 WebView2 进程释放、Rust 托盘仍在；再选文件按空格和双击托盘，应能重建窗口。
9. 保持设置打开、仅关闭预览，等待回收后设置仍可用；共享浏览器进程此时保留是正常的。
10. 托盘退出后检查应用及插件进程结束。修改前端应 HMR；修改 Rust 应重新编译重启并恢复托盘。

## 参考

- [Tauri 原生托盘](https://v2.tauri.app/learn/system-tray/)
- [Windows LowLevelKeyboardProc](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc)
- [IShellWindows](https://learn.microsoft.com/en-us/windows/win32/api/exdisp/nn-exdisp-ishellwindows)
- [IFolderView2::GetSelection](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifolderview2-getselection)
- [WebView2 进程模型](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model)


## 未保存编辑

编辑插件通过通用 `dirty()` 通道声明草稿。存在草稿时不销毁预览 WebView、不回收整个文件组及其共享源；关闭窗口仍只隐藏。前端只显示当前文件，不展示后台文件列表；重新打开原文件可恢复仍保留的草稿。停用或卸载有草稿的插件会拒绝操作；托盘退出要求用户确认丢弃。宿主 Rust 开发重启及进程崩溃不提供草稿持久化恢复。
