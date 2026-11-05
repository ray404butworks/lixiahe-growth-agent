import { z } from "zod";
import { amountUnits, decimalUnits, multiply } from "./money";
export const COST_FIELDS = [
  "unit_cost",
  "shipping_cost",
  "platform_fee",
  "ad_cost",
] as const;
export const FIELDS = [
  {
    key: "order_id",
    label: "订单编号",
    required: false,
    aliases: ["订单号", "订单ID"],
  },
  {
    key: "order_date",
    label: "订单日期",
    required: true,
    aliases: ["日期", "支付时间", "下单时间"],
  },
  {
    key: "sku",
    label: "SKU",
    required: true,
    aliases: ["商品编码", "商品编号"],
  },
  {
    key: "product_name",
    label: "商品名称",
    required: true,
    aliases: ["产品", "产品名称", "商品"],
  },
  {
    key: "channel",
    label: "销售渠道",
    required: true,
    aliases: ["渠道", "平台"],
  },
  {
    key: "quantity",
    label: "销售数量",
    required: true,
    aliases: ["数量", "件数", "销量"],
  },
  {
    key: "unit_price",
    label: "销售单价",
    required: true,
    aliases: ["单价", "商品单价"],
  },
  {
    key: "unit_cost",
    label: "单位进货成本",
    required: false,
    aliases: ["单位成本", "进货单价"],
  },
  {
    key: "shipping_cost",
    label: "该行分摊运费",
    required: false,
    aliases: ["运费", "物流成本"],
  },
  {
    key: "platform_fee",
    label: "该行分摊平台费",
    required: false,
    aliases: ["平台费", "佣金"],
  },
  {
    key: "ad_cost",
    label: "该行分摊广告费",
    required: false,
    aliases: ["广告费", "投流费"],
  },
  {
    key: "refund_amount",
    label: "该行退款金额",
    required: false,
    aliases: ["退款", "退款金额"],
  },
  {
    key: "order_status",
    label: "订单状态",
    required: false,
    aliases: ["状态", "交易状态"],
  },
] as const;
export type FieldKey = (typeof FIELDS)[number]["key"];
export type Mapping = Partial<Record<FieldKey, string>>;
const decimal = z
  .string()
  .regex(/^\d{1,18}(\.\d{1,8})?$/, "须为非负十进制数，最多8位小数");
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export const orderSchema = z
  .object({
    row_id: z.string().min(1),
    order_id: z.string().max(120).nullable(),
    order_date: z.string().refine(validDate, "日期不存在或格式错误"),
    sku: z.string().trim().min(1).max(100),
    product_name: z.string().trim().min(1).max(200),
    channel: z.string().trim().min(1).max(100),
    quantity: decimal.refine(
      (value) =>
        /^\d{1,18}(\.\d{1,8})?$/.test(value) && decimalUnits(value) > 0n,
      "数量须大于0",
    ),
    unit_price: decimal,
    unit_cost: decimal.nullable(),
    shipping_cost: decimal.nullable(),
    platform_fee: decimal.nullable(),
    ad_cost: decimal.nullable(),
    refund_amount: decimal.nullable(),
    order_status: z.enum(["paid", "refunded", "cancelled"]),
  })
  .superRefine((row, ctx) => {
    if (
      row.refund_amount !== null &&
      [row.refund_amount, row.quantity, row.unit_price].every((value) =>
        /^\d{1,18}(\.\d{1,8})?$/.test(value),
      ) &&
      amountUnits(row.refund_amount) > multiply(row.quantity, row.unit_price)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["refund_amount"],
        message: "退款金额超过该行成交金额",
      });
    }
  });
export type OrderRow = z.infer<typeof orderSchema>;
export function autoMap(headers: readonly string[]): Mapping {
  const mapping: Mapping = {};
  for (const field of FIELDS) {
    const aliases: readonly string[] = [
      field.key,
      field.label,
      ...field.aliases,
    ];
    const matches = headers.filter((header) =>
      aliases.some(
        (alias) => alias.toLowerCase() === header.trim().toLowerCase(),
      ),
    );
    if (matches.length === 1) mapping[field.key] = matches[0];
  }
  return mapping;
}
