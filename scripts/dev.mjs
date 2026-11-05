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
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child.kill(signal);
    api.kill(signal);
  });
child.on("exit", (code) => {
  api.kill("SIGTERM");
  process.exit(code ?? 1);
});
api.on("exit", (code) => {
  if (code) {
    child.kill("SIGTERM");
    process.exit(code);
  }
});
