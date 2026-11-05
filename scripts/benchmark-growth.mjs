import { registerHooks } from "node:module";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate)))
        return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});
const { generateDemo, rowsToCSV } = await import("../src/lib/growth/demo.ts");
const { autoMap } = await import("../src/lib/growth/contract.ts");
const { normalizeOrders } = await import("../src/lib/growth/import.ts");
const { computeMetrics } = await import("../src/lib/growth/metrics.ts");
const { parseCSV } = await import("../src/lib/csv-parser.ts");
const rows = generateDemo();
for (let i = 960; i < 1000; i++)
  rows.push({
    ...rows[i - 960],
    row_id: `row-${i + 2}`,
    order_id: `SYNTHETIC-${i + 1}`,
  });
const csv = rowsToCSV(rows);
const results = [];
for (let repeat = 0; repeat < 5; repeat++) {
  const begin = performance.now();
  const parsed = parseCSV(csv);
  const normalized = normalizeOrders(parsed, autoMap(parsed.headers), {
    assumePaid: false,
    assumeNoRefund: false,
  });
  const snapshot = computeMetrics(normalized.rows);
  results.push({
    duration_ms: Number((performance.now() - begin).toFixed(2)),
    valid_rows: normalized.rows.length,
    active_rows: snapshot.totals.line_count,
  });
}
const report = {
  measured_at: new Date().toISOString(),
  runtime: process.version,
  environment: "current managed Linux execution container",
  input_rows: 1000,
  runs: results,
  maximum_ms: Math.max(...results.map((row) => row.duration_ms)),
  target_ms: 5000,
  scope:
    "CSV parsing + mapping + validation + metrics; excludes UI rendering, filesystem read and LLM",
};
writeFileSync(
  "docs/performance-growth.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (report.maximum_ms > report.target_ms) process.exitCode = 1;
