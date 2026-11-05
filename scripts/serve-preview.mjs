import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const envPath = join(root, ".env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);
let createAgentHandler;
try {
  ({ createAgentHandler } = await import("../server-dist/server.js"));
} catch {
  console.error("缺少阶段三服务文件。请解压完整交付包，或先运行 pnpm build。");
  process.exit(1);
}
const handler = createAgentHandler({
  allowedOrigins: (process.env.LIXIAHE_DEV_ORIGINS ?? "")
    .split(",")
    .filter(Boolean),
});
const base = resolve(
  root,
  existsSync(join(root, "preview")) ? "preview" : "out",
);
const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".csv": "text/csv;charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const port = Number(process.env.LIXIAHE_PORT ?? 8080);
const host = process.env.LIXIAHE_HOST ?? "127.0.0.1";
const server = createServer(async (request, response) => {
  try {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `127.0.0.1:${port}`}`,
    );
    if (
      !["localhost", "127.0.0.1", "[::1]", "terminal.local"].includes(
        url.hostname,
      )
    ) {
      response.writeHead(403).end("Local access only");
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const init = { method: request.method, headers: request.headers };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = Readable.toWeb(request);
        init.duplex = "half";
      }
      const result = await handler(new Request(url, init));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    let path = resolve(base, `.${decodeURIComponent(url.pathname)}`);
    if (path !== base && !path.startsWith(base + sep)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    response.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : await readFile(path));
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end("Not found");
  }
});
server.requestTimeout = 75000;
server.headersTimeout = 15000;
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `端口${port}已被占用，请关闭旧版预览窗口后重试。`
      : "预览启动失败，请检查Node版本和端口设置。",
  );
  process.exitCode = 1;
});
server.listen(port, host, () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`里下河阶段三已启动：${url} （关闭终端即停止）`);
  console.log("API Key留空时自动使用离线规则模式。请在浏览器打开上述地址。");
  if (process.platform === "win32" && process.env.LIXIAHE_NO_OPEN !== "true")
    execFile(
      "cmd.exe",
      ["/c", "start", "", url],
      { windowsHide: true },
      () => {},
    );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
