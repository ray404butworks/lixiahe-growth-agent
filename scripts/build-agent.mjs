import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(
  new URL("../packages/csv-charts-ai/package.json", import.meta.url),
);
// Windows 绝对路径需转换为 file URL，才能被 ESM 动态导入。
const { build } = await import(pathToFileURL(require.resolve("tsup")).href);
await build({
  entry: { server: "src/lib/agent/server-entry.ts" },
  outDir: "server-dist",
  format: ["esm"],
  platform: "node",
  target: "node24",
  bundle: true,
  splitting: false,
  dts: false,
  clean: true,
  noExternal: ["zod"],
  sourcemap: false,
});
