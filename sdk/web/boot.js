// The page's own watchdog and error surface, loaded before the view module.
//
// It has to be a separate file rather than a few inline lines: a plugin page is served under a
// CSP that allows only scripts from the package, so an inline script never runs — including the
// one that would have said the page failed to start. That is how a broken page ends up showing
// nothing at all, which reads as "the plugin is empty" rather than as an error.
//
// Three jobs: report anything that throws while the page is coming up, report a file the
// package should have carried but did not, and say so when the page never became usable. The
// last one matters most: the view module can load and still wait forever for the host to hand
// it a port, which looks exactly like a page with nothing in it.
(function () {
  var moduleLoaded = false;
  var connected = false;
  window.__emberModuleLoaded = function () {
    moduleLoaded = true;
  };
  window.__emberBoot = function () {
    connected = true;
  };
  function surface(message) {
    var box = document.getElementById("error");
    if (!box || !message) return;
    // Whatever the page showed as a first failure stays: it is closer to the cause than
    // anything that follows it.
    if (!box.hidden && box.textContent) return;
    box.hidden = false;
    box.textContent = message;
  }
  window.addEventListener("error", function (event) {
    var target = event.target;
    // A file the page needs but the package does not carry arrives as an error event on the
    // element, with no message of its own.
    if (target && target !== window && (target.src || target.href)) {
      surface("插件页面缺少文件：" + (target.src || target.href) + "；请在插件市场更新或重新安装这个插件。");
      return;
    }
    surface("插件页面出错：" + (event.message || String(event.error || "")));
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    surface("插件页面出错：" + String((reason && reason.message) || reason || ""));
  });
  // Five seconds is far longer than mounting takes. Which of the two things is missing says
  // what to do about it, so they are reported differently: a module that never loaded is a
  // broken package, a module that loaded but never connected is a broken host session.
  setTimeout(function () {
    if (connected) return;
    surface(
      moduleLoaded
        ? "插件页面没有连上宿主：工具会话没有建立。请关闭这个窗口重新打开，或重启应用后重试。"
        : "插件页面未能启动：插件包缺少必需的文件。请在插件市场更新或重新安装这个插件。"
    );
  }, 5000);
})();
