import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(
  new URL("../packages/csv-charts-ai/", import.meta.url),
);
const cli = fileURLToPath(
  new URL(
    "../packages/csv-charts-ai/node_modules/tsup/dist/cli-default.js",
    import.meta.url,
  ),
);
const result = spawnSync(process.execPath, [cli], { cwd, stdio: "inherit" });
process.exit(result.status ?? 1);
