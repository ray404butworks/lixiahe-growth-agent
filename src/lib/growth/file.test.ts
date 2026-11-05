import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateWorkbookArchive } from "./file";
import readXlsxFile from "read-excel-file/node";
import { convertXLSXRows } from "csv-charts-ai";
import { autoMap } from "./contract";
import { normalizeOrders } from "./import";
import { computeMetrics } from "./metrics";
describe("XLSX文件边界", () => {
  it("真实XLSX字节经上游解析、映射后得到一致账本", async () => {
    const workbookRows = await readXlsxFile(
      "public/templates/synthetic-normal.xlsx",
      { sheet: "销售数据" },
    );
    const portableRows = workbookRows.map((row) =>
      row.map((cell) =>
        cell === null || cell instanceof Date ? cell : String(cell),
      ),
    );
    const data = convertXLSXRows(portableRows, { preserveExtraColumns: true });
    const result = normalizeOrders(data, autoMap(data.headers), {
      assumePaid: false,
      assumeNoRefund: false,
    });
    expect(result.quality.valid_rows).toBe(960);
    expect(computeMetrics(result.rows).totals.net_sales).toBe("225436");
  });
  it("接受已生成的Excel模板", () => {
    const buffer = readFileSync("public/templates/lixiahe-template.xlsx");
    expect(() =>
      validateWorkbookArchive(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
      ),
    ).not.toThrow();
  });
  it("拒绝伪造Excel和空文件", () => {
    expect(() => validateWorkbookArchive(new ArrayBuffer(0))).toThrow(
      "不是有效",
    );
    expect(() =>
      validateWorkbookArchive(new TextEncoder().encode("hello").buffer),
    ).toThrow("不是有效");
  });
  it("拒绝解压体积超过25MiB", () => {
    const buffer = new ArrayBuffer(68),
      view = new DataView(buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(24, 26 * 1024 * 1024, true);
    view.setUint32(46, 0x06054b50, true);
    view.setUint16(56, 1, true);
    view.setUint32(62, 0, true);
    expect(() => validateWorkbookArchive(buffer)).toThrow("25MB");
  });
});
