import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
// Pass an alternate compiled module to compare an immutable baseline on this machine.
const { parseCSV, computeDiff, generateDataSummary, processChartData } =
  await import(
    pathToFileURL(
      resolve(process.argv[2] ?? "packages/csv-charts-ai/dist/index.js"),
    ).href
  );
const measurements = [];
for (const rows of [1000, 10000, 100000]) {
  const csv =
    "id,value,group\n" +
    Array.from({ length: rows }, (_, i) => `${i},${i % 1000},g${i % 8}`).join(
      "\n",
    );
  const data = parseCSV(csv);
  const duplicates = {
    ...data,
    rows: Array.from({ length: rows }, () => ["same", "2", "g"]),
  };
  const cases = {
    /** 测量表格文本解析耗时。 */
    parse: () => parseCSV(csv),
    /** 测量数据摘要生成耗时。 */
    summary: () => generateDataSummary(data),
    /** 测量图表数据聚合耗时。 */
    chart: () =>
      processChartData(data, {
        type: "bar",
        xAxis: "group",
        yAxis: "value",
        aggregation: "sum",
      }),
    /** 测量普通表格比对耗时。 */
    diff: () => computeDiff(data, data, { matchMode: "content" }),
    /** 用高重复度表格测量比对耗时。 */
    duplicateDiff: () =>
      computeDiff(duplicates, duplicates, { matchMode: "content" }),
    /** 测量按数值筛选行的耗时。 */
    filter: () => data.rows.filter((row) => Number(row[1]) > 500),
    /** 测量按数值排序的耗时。 */
    sort: () => [...data.rows].sort((a, b) => Number(a[1]) - Number(b[1])),
  };
  for (const [operation, run] of Object.entries(cases)) {
    // The old duplicate path takes tens of seconds at 100k: retain one measured run.
    const repeats = operation === "duplicateDiff" && rows === 100000 ? 1 : 5;
    const times = [];
    let maxHeapDelta = 0;
    for (let i = 0; i < repeats; i++) {
      global.gc?.();
      const heap = process.memoryUsage().heapUsed;
      const start = performance.now();
      const result = run();
      times.push(performance.now() - start);
      maxHeapDelta = Math.max(
        maxHeapDelta,
        process.memoryUsage().heapUsed - heap,
      );
      if (result === undefined)
        throw new Error(`${operation} returned no result`);
    }
    times.sort((a, b) => a - b);
    measurements.push({
      rows,
      operation,
      medianMs: Number(times[Math.floor(times.length / 2)].toFixed(2)),
      // End-minus-start allocation sample, not a peak or retained-memory measurement.
      maxHeapDeltaMiB: Number((maxHeapDelta / 1024 / 1024).toFixed(2)),
      runs: repeats,
    });
  }
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      measurements,
    },
    null,
    2,
  ),
);
