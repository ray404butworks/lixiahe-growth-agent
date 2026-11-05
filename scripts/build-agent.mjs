import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/csv-charts-ai/package.json", import.meta.url),
);
const { build } = await import(require.resolve("tsup"));
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
