import { createServer } from "vite";
import net from "node:net";
import { buildPlugins, watchPlugins, stopBuild } from "./build-plugins.mjs";

let server,
  stopWatching = () => {},
  stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  stopWatching();
  await Promise.allSettled([server?.close(), stopBuild()]);
  process.exit(code);
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
try {
  // Refuse to take over an existing server. Never kill a process occupying this port.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () =>
      reject(new Error("127.0.0.1:1420 已被占用。请自行处理已有服务后重试。")),
    );
    probe.listen(1420, "127.0.0.1", () => probe.close(resolve));
  });
  console.log("[dev] 构建内置插件市场…");
  stopWatching = watchPlugins();
  await buildPlugins();
  if (!stopping) {
    server = await createServer();
    await server.listen();
    server.printUrls();
    console.log(
      "[dev] 前端 HMR 与插件监视已就绪；Tauri CLI 将启动并监视 Rust 后端。",
    );
  }
} catch (error) {
  console.error(error);
  await shutdown(1);
}
