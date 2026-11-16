import { COST_FIELDS, orderSchema, validDate, type OrderRow } from "./contract";
import {
  amountUnits,
  decimalUnits,
  formatUnits,
  multiply,
  roundedRatio,
  totalUnits,
} from "./money";
export type Filters = { start?: string; end?: string; channel?: string };
/** 计算两个周期的变化率，并处理上期为零和缺失数据。 */
export function growthRate(current: string | null, prior: string | null) {
  if (current === null || prior === null)
    return { status: "unavailable", value: null } as const;
  // Sales are nonnegative under the import contract.
  const now = totalUnits(current),
    previous = totalUnits(prior);
  if (previous === 0n)
    return { status: now === 0n ? "unavailable" : "new", value: null } as const;
  return {
    status: "comparable",
    value: roundedRatio(now - previous, previous),
  } as const;
}
/** 以定点数精确汇总订单、销售、退款和贡献毛益。 */
export function summarize(rows: readonly OrderRow[]) {
  let gross = 0n,
    refunds = 0n,
    costs = 0n,
    quantity = 0n;
  const missing = new Set<string>();
  for (const row of rows) {
    gross += multiply(row.quantity, row.unit_price);
    quantity += decimalUnits(row.quantity);
    if (row.refund_amount === null) missing.add("refund_amount");
    else refunds += amountUnits(row.refund_amount);
    for (const field of COST_FIELDS) {
      const value = row[field];
      if (value === null) missing.add(field);
      else
        costs +=
          field === "unit_cost"
            ? multiply(row.quantity, value)
            : amountUnits(value);
    }
  }
  const net = missing.has("refund_amount") ? null : gross - refunds;
  const contribution =
    rows.length &&
    net !== null &&
    !COST_FIELDS.some((field) => missing.has(field))
      ? net - costs
      : null;
  const orderCount =
    rows.length && rows.every((row) => !!row.order_id)
      ? new Set(rows.map((row) => row.order_id)).size
      : null;
  return {
    line_count: rows.length,
    order_count: orderCount,
    quantity: formatUnits(quantity, 8),
    gross_sales: formatUnits(gross),
    known_refunds: formatUnits(refunds),
    known_variable_costs: formatUnits(costs),
    net_sales: net === null ? null : formatUnits(net),
    contribution: contribution === null ? null : formatUnits(contribution),
    contribution_rate:
      contribution === null || net === null
        ? null
        : roundedRatio(contribution, net),
    average_order_value:
      orderCount && net !== null
        ? roundedRatio(net, BigInt(orderCount) * 10n ** 16n)
        : null,
    average_line_value:
      rows.length && net !== null
        ? roundedRatio(net, BigInt(rows.length) * 10n ** 16n)
        : null,
    missing_fields: [...missing].sort(),
  };
}
export type Totals = ReturnType<typeof summarize>;
export type Group = Totals & { key: string; name: string };
/** 根据日期和渠道筛选有效订单，再生成总览、分组及周期对比。 */
export function computeMetrics(
  input: readonly OrderRow[],
  filters: Filters = {},
) {
  if (input.length > 10000) throw new Error("超过10,000行上限");
  for (const date of [filters.start, filters.end])
    if (date && !validDate(date)) throw new Error("筛选日期无效");
  if (filters.start && filters.end && filters.start > filters.end)
    throw new Error("开始日期不能晚于结束日期");
  const validated = input.map((row) => orderSchema.parse(row));
  if (new Set(validated.map((row) => row.row_id)).size !== validated.length)
    throw new Error("订单行标识重复");
  const ranged = validated.filter(
    (row) =>
      (!filters.start || row.order_date >= filters.start) &&
      (!filters.end || row.order_date <= filters.end) &&
      (!filters.channel || row.channel === filters.channel),
  );
  const rows = ranged.filter((row) => row.order_status !== "cancelled");
  /** 按指定经营维度分组，并使用同一指标口径汇总每组。 */
  const aggregate = (key: "channel" | "sku" | "order_date"): Group[] => {
    const groups = new Map<string, OrderRow[]>();
    for (const row of rows) {
      const group = groups.get(row[key]) ?? [];
      group.push(row);
      groups.set(row[key], group);
    }
    return [...groups]
      .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
      .map(([id, items]) => ({
        key: id,
        name: key === "sku" ? items[0]!.product_name : id,
        ...summarize(items),
      }));
  };
  const dates = rows.map((row) => row.order_date).sort();
  // Compare the last 7 calendar days in the selected period against the preceding 7.
  const end = filters.end ?? dates.at(-1);
  /** 按 UTC 日历移动日期，避免本地时区导致范围偏移。 */
  const offset = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
      .toISOString()
      .slice(0, 10);
  const currentStart = end ? offset(end, -6) : null;
  const priorStart = end ? offset(end, -13) : null;
  const priorEnd = end ? offset(end, -7) : null;
  const comparableRange =
    !!priorStart &&
    (!filters.start || filters.start <= priorStart) &&
    !!dates[0] &&
    dates[0] <= priorStart;
  const current = rows.filter(
    (row) => currentStart && row.order_date >= currentStart,
  );
  const prior = rows.filter(
    (row) =>
      priorStart &&
      priorEnd &&
      row.order_date >= priorStart &&
      row.order_date <= priorEnd,
  );
  const totals = summarize(rows);
  const ids = new Map<string, number>();
  rows.forEach((row) => {
    if (row.order_id) ids.set(row.order_id, (ids.get(row.order_id) ?? 0) + 1);
  });
  return {
    schema_version: "1.0",
    totals,
    channels: aggregate("channel"),
    skus: aggregate("sku"),
    daily: aggregate("order_date"),
    scope: {
      start: dates[0] ?? null,
      end: dates.at(-1) ?? null,
      cancelled: ranged.length - rows.length,
      selected_rows: ranged.length,
      input_rows: input.length,
    },
    comparison: {
      current_start: currentStart,
      current_end: end ?? null,
      prior_start: priorStart,
      prior_end: priorEnd,
      ...(comparableRange
        ? growthRate(summarize(current).net_sales, summarize(prior).net_sales)
        : { status: "unavailable", value: null }),
    },
    quality: {
      duplicate_order_ids: [...ids]
        .filter(([, count]) => count > 1)
        .map(([id]) => id),
      missing_id_rows: rows.filter((row) => !row.order_id).length,
    },
  };
}
export type MetricSnapshot = ReturnType<typeof computeMetrics>;
