import type { CSVData } from "../csv-parser";
import { FIELDS, type Mapping, type OrderRow, orderSchema } from "./contract";
export const MAX_ROWS = 10000;
export const MAX_BYTES = 5 * 1024 * 1024;
export type ImportOptions = { assumePaid: boolean; assumeNoRefund: boolean };
export type RowIssue = { row: number; field: string; message: string };
export type QualityReport = {
  input_rows: number;
  valid_rows: number;
  rejected_rows: number;
  issues: RowIssue[];
  warnings: string[];
  missing_columns: string[];
  missing_counts: Record<string, number>;
  duplicate_order_ids: string[];
  extreme_rows: number[];
  period: { start: string | null; end: string | null };
};
const statuses: Record<string, OrderRow["order_status"]> = {
  paid: "paid",
  已支付: "paid",
  已完成: "paid",
  交易成功: "paid",
  refunded: "refunded",
  退款: "refunded",
  已退款: "refunded",
  部分退款: "refunded",
  cancelled: "cancelled",
  canceled: "cancelled",
  取消: "cancelled",
  已取消: "cancelled",
  交易关闭: "cancelled",
};
export function normalizeDate(raw: string): string {
  const iso =
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)?$/.exec(
      raw,
    );
  if (iso)
    return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  // Excel serial dates: 1900 system; serial 60 is the non-existent 1900-02-29.
  if (/^\d{1,5}(\.\d+)?$/.test(raw)) {
    const days = Math.floor(Number(raw));
    if (days === 60 || days < 1) return raw;
    return new Date(
      Date.UTC(1899, 11, 31) + (days > 60 ? days - 1 : days) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  }
  return raw;
}
export function normalizeOrders(
  data: CSVData,
  mapping: Mapping,
  options: ImportOptions,
): { rows: OrderRow[]; quality: QualityReport } {
  if (!data.rows.length)
    throw new Error("文件没有数据行，请检查表头和工作表。");
  if (data.rows.length > MAX_ROWS)
    throw new Error("超过10,000行上限，请拆分文件后导入。");
  const used = Object.values(mapping).filter(Boolean);
  if (new Set(used).size !== used.length)
    throw new Error("同一源列不能映射到多个业务字段。");
  if (used.some((header) => !data.headers.includes(header)))
    throw new Error("字段映射引用了不存在的列。");
  const missingRequired = FIELDS.filter(
    (field) => field.required && !mapping[field.key],
  );
  if (missingRequired.length)
    throw new Error(
      `请映射必需字段：${missingRequired.map((f) => f.label).join("、")}`,
    );
  const quality: QualityReport = {
    input_rows: data.rows.length,
    valid_rows: 0,
    rejected_rows: 0,
    issues: [],
    warnings: [],
    missing_columns: FIELDS.filter((field) => !mapping[field.key]).map(
      (field) => field.key,
    ),
    missing_counts: {},
    duplicate_order_ids: [],
    extreme_rows: [],
    period: { start: null, end: null },
  };
  const rows: OrderRow[] = [];
  const ids = new Map<string, number>();
  data.rows.forEach((source, index) => {
    const values = Object.fromEntries(
      FIELDS.map((field) => {
        const header = mapping[field.key];
        const raw = header
          ? String(source[data.headers.indexOf(header)] ?? "").trim()
          : "";
        if (!raw)
          quality.missing_counts[field.key] =
            (quality.missing_counts[field.key] ?? 0) + 1;
        return [field.key, raw || null];
      }),
    );
    values.row_id = `row-${index + 2}`;
    values.order_date = normalizeDate(String(values.order_date ?? ""));
    values.order_status = values.order_status
      ? (statuses[String(values.order_status).toLowerCase()] ??
        values.order_status)
      : options.assumePaid
        ? "paid"
        : null;
    if (values.refund_amount === null && options.assumeNoRefund)
      values.refund_amount = "0";
    const parsed = orderSchema.safeParse(values);
    if (!parsed.success) {
      quality.rejected_rows++;
      for (const issue of parsed.error.issues)
        quality.issues.push({
          row: index + 2,
          field: String(issue.path[0] ?? "row"),
          message:
            issue.code === "invalid_type"
              ? "字段为空或类型不正确"
              : issue.code === "invalid_value"
                ? "订单状态不受支持，请使用已支付、已退款、已取消或对应英文值"
                : issue.code === "too_big"
                  ? "字段内容超过允许长度"
                  : issue.message,
        });
      return;
    }
    const row = parsed.data;
    rows.push(row);
    if (row.order_id) ids.set(row.order_id, (ids.get(row.order_id) ?? 0) + 1);
    if (Number(row.quantity) > 10000 || Number(row.unit_price) > 100000)
      quality.extreme_rows.push(index + 2);
  });
  quality.valid_rows = rows.length;
  quality.duplicate_order_ids = [...ids]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  const dates = rows.map((row) => row.order_date).sort();
  quality.period = { start: dates[0] ?? null, end: dates.at(-1) ?? null };
  if (quality.duplicate_order_ids.length)
    quality.warnings.push(
      "重复订单ID可能是多商品订单或重复导出；未自动删行，请核对。费用须按订单行分摊。",
    );
  if (quality.extreme_rows.length)
    quality.warnings.push(
      "检测到极端数量或单价，请核对原始数据；这些行未被自动删除。",
    );
  if (options.assumePaid)
    quality.warnings.push("你已确认：空白订单状态按已支付处理。");
  if (options.assumeNoRefund)
    quality.warnings.push("你已确认：空白退款金额按0处理。");
  return { rows, quality };
}
