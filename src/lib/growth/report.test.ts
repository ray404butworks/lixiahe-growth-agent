import { expect, it } from "vitest";
import { generateDemo, rowsToCSV } from "./demo";
import { autoMap } from "./contract";
import { normalizeOrders } from "./import";
import { computeMetrics } from "./metrics";
import { buildReport, reportCsv, reportHtml, reportMarkdown } from "./report";
import { parseCSVWithDiagnostics } from "../csv-parser";
import { rulesFromSnapshot } from "../agent/rules";

it("导出只使用当前范围，隔离旧诊断并转义外来文本", () => {
  const source = parseCSVWithDiagnostics(rowsToCSV(generateDemo())).data;
  const { rows, quality } = normalizeOrders(source, autoMap(source.headers), {
    assumePaid: false,
    assumeNoRefund: false,
  });
  const original = computeMetrics(rows);
  const diagnosis = rulesFromSnapshot(original, true);
  const channel = " =HYPERLINK(<img src=x onerror=alert(1)>)";
  const snapshot = computeMetrics([
    { ...rows[0]!, channel, order_status: "paid" },
  ]);
  const report = buildReport({
    snapshot,
    quality,
    synthetic: true,
    channel,
    diagnosis,
    draft: null,
    edited: false,
  });

  expect(
    report.sections.find((section) => section.title === "经营诊断")
      ?.paragraphs?.[0],
  ).toContain("尚无诊断");
  expect(reportCsv(report)).toContain(`"'${channel.trim()}"`);
  expect(reportCsv(report)).not.toContain(rows[0]!.order_id);
  expect(reportHtml(report)).toContain("&lt;img");
  expect(reportHtml(report)).not.toContain("<img");
  expect(reportMarkdown(report)).toContain("合成样例");
  expect(reportMarkdown(report)).not.toContain("<img");
});
