# 开发脚手架

调试界面问题时，不要靠读源码或另建一个复现页面来推断运行中的行为 —— 那只能证明"代码应该工作"，证明不了"应用里实际发生了什么"。这套工具直接读运行中 WebView 的真实 DOM。

## 启动共享环境

```powershell
.\tools\dev-with-debug.ps1                      # 只起服务，窗口按需自己开
.\tools\dev-with-debug.ps1 docs\plugins.md      # 一条命令：服务 + 直接打开这个文件的预览窗口
```

（本机只有 Windows PowerShell 5.1，没有 `pwsh`，所以直接用脚本路径调用。想双击启动就双击 `tools\dev-with-debug.cmd`：它用不依赖本机执行策略的方式调同一个脚本，出错时暂停好让你看见原因。`.ps1` 双击默认是记事本打开，不会运行。）

**这条命令是共享的**：前端在 `1420`，调试端点在 `9444`，没有"谁的窗口"之分 —— 谁都能用 `tools/live-targets.mjs` 读同一个窗口，也都能用 `tools/live-shot.mjs` 截它。带上一个文件参数是让它真正只有一步：宿主按需创建窗口，没有窗口时调试端点没有目标可列，所以传文件＝起来就能接。

起来之后先跑一次 `node tools/live-targets.mjs`，确认窗口 URL 是 `http://127.0.0.1:1420/...` 而不是 `tauri.localhost`：后者说明窗口吃的是 `dist` 产物，既没有 HMR，也不是你正在改的那份源码。

它做三件事：

1. 若 `1420` 已被占用则复用，否则在 `http://127.0.0.1:1420` 启动 Vite + 插件监视
2. 若 `9444` 已有实例在跑则直接退出，避免重复启动
3. 否则带 WebView2 调试端口启动应用，调试端点位于 `http://127.0.0.1:9444`

它用 `tauri.external-dev.json` 启动：那份配置清空 `beforeDevCommand`（不再自己起前端），并把 `devUrl` 再写一遍。**`--config` 是整块替换 `build` 表**，所以少写 `devUrl` 时应用会静默回落到 `frontendDist`（`../dist`）——窗口跑的是上次 `npm run build` 的产物，既没有 HMR，也不是开发服务器上那份代码。调前端时看到"改了没生效"，先确认窗口的 URL 是 `http://127.0.0.1:1420/...` 而不是 `tauri.localhost`。

调试端口这条路径有两处坑，都踩过，改之前先看清楚：

- **不能用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`。** wry 总是给 WebView2 传一份显式的参数串（默认是 `--disable-features=...`），而 WebView2 只在这份参数串为空时才去读它自己的环境变量 —— 于是那个变量永远不生效，端口永远不开。参数改由应用自己传：脚本设置 `EMBER_WEBVIEW_ARGS`，`src-tauri/src/desktop.rs` 里的 `browser_args()` 把它交给窗口构建器。**传参是整体替换 wry 的默认值**，所以脚本里要把那几个 `--disable-features` 一起写上。
- **端口不能落在 Windows 保留段里。** `netsh int ipv4 show excludedportrange protocol=tcp` 里那些段（Hyper-V/WSL 占的）谁也绑不上，WebView2 会**静默失败**——端点就是不出现，看起来像脚手架坏了。本机的 `9222` 正落在 `9126–9225` 里，所以默认端口改成了 `9444`；脚本启动前会先试绑，绑不上就直接报错并让你换端口。

手动设置这个变量再 `npm run dev` 也能开调试端口（变量一样会到达应用进程），区别只在脚本还替你做了两件事：启动前检查端口能否绑定、已有人在跑就复用而不是再起一套。

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

**但真实输入派发不了"离开"。** 用 `Input.dispatchMouseEvent` 把指针移到插件网页上方时，父文档收不到 `pointerout` / `pointerleave`（指针进了另一个 document，而这一跳是注入的，浏览器那套跨进程 hover 收尾没有发生），于是所有"移开后该收起"的状态都停在原地。宿主两条栏的显形就是这种状态：注入的移动能叫出两条栏，却收不回去。**显形一侧可以用注入输入测，收起一侧必须用手测**，别把它当成回归报上去——2026-09-23 就这么误判过一次。想在脚本里清掉这种卡住的状态，就派一个合成的 `pointerout`（`bubbles: true`，坐标指向插件区域），React 合成事件会照常走 `dropChrome`。

## 三个必须知道的坑

**1. 宿主默认没有窗口。** `src-tauri/tauri.conf.json` 里 `"windows": []`，窗口全部按需创建（托盘、资源管理器空格、设置、命令行第一个参数传文件路径），所以打开窗口之前 `live-targets.mjs` 没有目标，调试端点也不会开。用 `EMBER_DEBUG_WINDOW=settings` 让宿主启动时直接开一个设置窗口（另有 `plugins` / `about` / `welcome`）；不要为了让引导页出现去改 `.plugins/host-state.json` 的 `onboarded`，那会让下次启动重新弹引导页。这个变量只在 debug 构建里生效。

**2. 插件更新会切断并自动重开正在预览的会话。** 更新是覆盖式的：宿主先停掉该插件的进程，把新包换进同一个安装目录，再按原路径重新打开被切断的文件——所以改完插件代码**不需要手动重开文件**，预览会自己刷新到新构建；`revision` 只在一次安装的生命周期内保持不变，`.plugins/` 下每个插件只有一个目录。但"多久刷新"取决于两段延迟：`plugins:watch` 先重建本地镜像（构建脚本会打印新的 `buildId`），宿主每两秒检查一次已安装插件与镜像的差异，而**本地镜像缓存 1 秒**。排查插件没有更新时，先确认构建已完成，再检查是否因未保存草稿而拒绝更新。远程目录缓存 10 分钟，可在市场主动刷新。

**3. `dev-with-debug.ps1` 必须保持纯 ASCII。** Windows PowerShell 5.1 用系统 ANSI 码页读取 `.ps1`，非 ASCII 字符（比如中文注释）会变成乱码并可能直接导致语法错误。

## 排查用的临时表达式

`expr.js` 这类临时文件放仓库外或随手删除，不要提交。脚手架本身是长期使用的。
