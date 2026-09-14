import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  // 版本号唯一来源是 package.json，界面直接读 __APP_VERSION__。
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/crates/**",
        "**/plugins/**",
        "**/target/**",
        "**/.plugins/**",
        "**/.marketplace/**",
      ],
    },
  },
  build: { target: "es2022" },
});
