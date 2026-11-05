import type { MetricSnapshot, Totals } from "../growth/metrics";
import { money } from "../growth/money";
export type Evidence = {
  key: string;
  label: string;
  value: string;
  display: string;
};
const labels: Partial<Record<keyof Totals, string>> = {
  gross_sales: "商品成交额",
  net_sales: "扣退款销售额",
  known_refunds: "已知退款",
  known_variable_costs: "已知可变成本",
  contribution: "贡献毛益",
  contribution_rate: "贡献率",
  quantity: "销量",
  line_count: "有效商品行数",
  order_count: "有效订单数",
};
export function evidenceRegistry(
  snapshot: MetricSnapshot,
): Record<string, Evidence> {
  const registry: Record<string, Evidence> = Object.create(null) as Record<
    string,
    Evidence
  >;
  const add = (prefix: string, totals: Totals, name = "全部") => {
    for (const [field, title] of Object.entries(labels)) {
      const value = totals[field as keyof Totals];
      if (value === null || Array.isArray(value)) continue;
      const key = `${prefix}.${field}`;
      const text = String(value);
      const display =
        field === "contribution_rate"
          ? `${(Number(text) * 100).toFixed(2)}%`
          : field === "quantity"
            ? `${text}件`
            : field === "order_count"
              ? `${text}单`
              : field === "line_count"
                ? `${text}行`
                : `¥${money(text)}`;
      registry[key] = {
        key,
        label: `${name} · ${title}`,
        value: text,
        display,
      };
    }
  };
  add("totals", snapshot.totals);
  for (const group of snapshot.channels)
    add(`channel.${encodeURIComponent(group.key)}`, group, group.name);
  for (const group of snapshot.skus)
    add(`sku.${encodeURIComponent(group.key)}`, group, group.name);
  return registry;
}
export function snapshotId(snapshot: MetricSnapshot): string {
  // Deterministic change detector, not a security signature or proof of authenticity.
  const value = JSON.stringify(snapshot);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `metrics-${(hash >>> 0).toString(16)}`;
}
