import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// The managed preview supplies Vite-style options; translate for Next.js.
const args = process.argv
  .slice(2)
  .filter((arg) => arg !== "--strictPort")
  .map((arg) => (arg === "--host" ? "--hostname" : arg));
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? args[portIndex + 1] : "3000";
const api = spawn(process.execPath, ["scripts/serve-preview.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    LIXIAHE_PORT: "8080",
    LIXIAHE_NO_OPEN: "true",
    LIXIAHE_DEV_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port},http://terminal.local:${port}`,
  },
});
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", ...args],
  { stdio: "inherit" },
);
// 退出开发命令时向页面服务和本地 API 转发信号。
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child.kill(signal);
    api.kill(signal);
  });
// 页面服务退出后关闭本地 API，并传出其退出码。
child.on("exit", (code) => {
  api.kill("SIGTERM");
  process.exit(code ?? 1);
});
// API 启动失败时终止页面服务，避免留下只能部分工作的开发环境。
api.on("exit", (code) => {
  if (code) {
    child.kill("SIGTERM");
    process.exit(code);
  }
});
