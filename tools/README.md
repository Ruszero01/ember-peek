# 开发脚手架

调试界面问题时，不要靠读源码或另建一个复现页面来推断运行中的行为 —— 那只能证明"代码应该工作"，证明不了"应用里实际发生了什么"。这套工具直接读运行中 WebView 的真实 DOM。

## 启动共享环境

```powershell
.\tools\dev-with-debug.ps1
```

（本机只有 Windows PowerShell 5.1，没有 `pwsh`，所以直接用脚本路径调用。）

它做三件事：

1. 若 `1420` 已被占用则复用，否则在 `http://127.0.0.1:1420` 启动 Vite + 插件监视
2. 若 `9222` 已有实例在跑则直接退出，避免重复启动
3. 否则带 WebView2 调试端口启动应用，调试端点位于 `http://127.0.0.1:9222`

它用 `tauri.external-dev.json`（清空了 `beforeDevCommand`）启动，因此只会附着到已有的前端服务，不会尝试再起一个。

之所以不用 `npm run dev`，是因为调试端口依赖 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 环境变量。**注意：必须直接运行脚本**，`npm run tauri -- dev` 这条链路会把环境变量交给 npm 而不是最终的应用，调试端口不会打开。

## 读取运行时状态

```powershell
node tools/live-targets.mjs                              # 列出当前窗口
node tools/live-targets.mjs plugin.localhost expr.js     # 在插件视图里求值
node tools/live-targets.mjs "window=settings" expr.js    # 在设置窗口里求值
node tools/live-targets.mjs plugin.localhost expr.js --logs   # 同时打印它的控制台
node tools/live-shot.mjs out.png                         # 截预览窗口整幅
node tools/live-shot.mjs out.png 820 668 240 72 3         # 截指定区域 x y w h 缩放
```

**判断视觉问题（图标、间距、配色）一定要截图**：计算样式只能证明数值对，证明不了看起来对。`live-shot.mjs` 直接截运行中的预览窗口，用于这类判断。

`expr.js` 是任意一段 JS 表达式文件。**用文件传参，不要内联**：shell 会吞掉引号，`#id` 会被解析成私有字段语法（`SyntaxError: Private field '#viewport' must be declared in an enclosing class`），字符串字面量也会被破坏。

表达式模板：

```js
(() => {
  const element = document.getElementById("lines");
  return JSON.stringify({
    computed: getComputedStyle(element).transform,
    rect: element.getBoundingClientRect().toJSON(),
    scrollTop: document.getElementById("viewport").scrollTop,
  }, null, 1);
})()
```

两点写表达式时的坑：

- 别用与插件脚本同名的顶层变量（如 `lines`、`viewport`），会因 TDZ 报 `Cannot access 'lines' before initialization`。用 `vpEl`、`lnEl` 之类。
- 读经过 `requestAnimationFrame` 去抖的状态时，派发事件后要等一帧再读，否则量到的是上一帧。

## 模拟真实输入

要触发 React 的 `onChange`，用 CDP 的真实输入，不要 `dispatchEvent(new Event("input"))` —— 后者经常不触发合成事件，会让人误判成功能坏了。`tools/live-targets.mjs` 导出的 `connect()` 上有 `typeText`：

```js
await client.typeText("插件");
```

## 三个必须知道的坑

**1. 应用启动时不创建窗口。** `src-tauri/tauri.conf.json` 里 `"windows": []`，窗口按需创建（托盘、资源管理器空格、设置、命令行传文件路径）。所以在打开窗口之前，`live-targets.mjs` 没有目标，调试端口也不会打开。

**宿主默认没有窗口。** 窗口按需创建，托盘应用启动时一个窗口都没有，所以 `live-targets.mjs` 会看不到目标。用 `EMBER_DEBUG_WINDOW=settings` 让宿主启动时开一个设置窗口（另有 `plugins`/`about`/`welcome`），不要为了让引导页出现去改 `.plugins/host-state.json` 的 `onboarded`。

**2. 插件更新会切断并自动重开正在预览的会话。** 更新是覆盖式的：宿主先停掉该插件的进程，把新包换进同一个安装目录，再按原路径重新打开被切断的文件——所以改完插件代码（`plugins:watch` 会重建本地镜像，宿主两秒内同步）**不需要手动重开文件**，预览会自己刷新到新构建。`revision` 只在一次安装的生命周期内保持不变，`.plugins/` 下每个插件只有一个目录。排查"改了没生效"时先确认镜像确实重建了（构建脚本会打印新的 buildId）——目录缓存有 10 分钟 TTL，宿主最长要等这么久才会看到新目录。

**3. `dev-with-debug.ps1` 必须保持纯 ASCII。** Windows PowerShell 5.1 用系统 ANSI 码页读取 `.ps1`，非 ASCII 字符（比如中文注释）会变成乱码并可能直接导致语法错误。

## 排查用的临时表达式

`expr.js` 这类临时文件放仓库外或随手删除，不要提交。脚手架本身是长期使用的。
