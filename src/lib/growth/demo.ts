import { FIELDS, type OrderRow } from "./contract";
export type Scenario = "normal" | "low-contribution" | "high-refund";
export const SCENARIOS: {
  key: Scenario;
  title: string;
  description: string;
}[] = [
  {
    key: "normal",
    title: "正常经营",
    description: "大米、河蟹、蔬菜的多渠道销售",
  },
  {
    key: "low-contribution",
    title: "渠道高销售，低贡献",
    description: "看清投流支出对抖音渠道的影响",
  },
  {
    key: "high-refund",
    title: "河蟹退款偏高",
    description: "观察退款如何改变商品表现",
  },
];
export function generateDemo(
  scenario: Scenario = "normal",
  seed = 20261104,
): OrderRow[] {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const products = [
    {
      sku: "RICE-5KG",
      name: "大米5kg（兴化品类示例）",
      price: 6800,
      cost: "40",
    },
    {
      sku: "CRAB-BOX",
      name: "河蟹礼盒（品类示例）",
      price: 22800,
      cost: "140",
    },
    {
      sku: "VEG-250G",
      name: "脱水蔬菜250g（品类示例）",
      price: 2600,
      cost: "12",
    },
  ];
  const channels = ["抖音店铺", "微信私域", "线下团购"];
  return Array.from({ length: 960 }, (_, index) => {
    const product = products[Math.floor(random() * products.length)]!;
    const channel = Math.floor(random() * channels.length);
    const quantity = 1 + Math.floor(random() * 4);
    const cancelled = random() < 0.025;
    const refunded =
      !cancelled &&
      random() <
        (scenario === "high-refund" && product.sku === "CRAB-BOX" ? 0.3 : 0.04);
    const cents = (value: number) =>
      `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
    return {
      row_id: `row-${index + 2}`,
      order_id: `SYNTHETIC-${String(index + 1).padStart(5, "0")}`,
      order_date: new Date(Date.UTC(2026, 8, 1 + Math.floor(index / 16)))
        .toISOString()
        .slice(0, 10),
      sku: product.sku,
      product_name: product.name,
      channel: channels[channel]!,
      quantity: String(quantity),
      unit_price: cents(product.price),
      unit_cost: product.cost,
      shipping_cost: channel === 2 ? "0" : "6",
      platform_fee: channel === 0 ? "4" : "0",
      ad_cost:
        channel === 0 ? (scenario === "low-contribution" ? "120" : "8") : "0",
      refund_amount: refunded ? cents(product.price * quantity) : "0",
      order_status: cancelled ? "cancelled" : refunded ? "refunded" : "paid",
    };
  });
}
function safeCell(value: string): string {
  // Prevent spreadsheet formula execution in CSV downloads.
  const safe =
    /^[=+@\t\r]/.test(value) || /^-\D/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export function rowsToCSV(
  rows: readonly OrderRow[],
  chineseHeaders = false,
): string {
  return (
    "\uFEFF" +
    [
      FIELDS.map((field) => (chineseHeaders ? field.label : field.key)).join(
        ",",
      ),
      ...rows.map((row) =>
        FIELDS.map((field) => safeCell(row[field.key] ?? "")).join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
