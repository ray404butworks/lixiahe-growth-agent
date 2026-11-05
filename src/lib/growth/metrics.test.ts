import { describe, expect, it } from "vitest";
import { computeMetrics, growthRate } from "./metrics";
import { money } from "./money";
import type { OrderRow } from "./contract";
import { generateDemo } from "./demo";
const base: OrderRow = {
  row_id: "1",
  order_id: "A",
  order_date: "2026-10-01",
  sku: "RICE",
  product_name: "大米",
  channel: "私域",
  quantity: "2",
  unit_price: "10.50",
  unit_cost: "3",
  shipping_cost: "1",
  platform_fee: "2",
  ad_cost: "1",
  refund_amount: "2",
  order_status: "paid",
};
const row = (overrides: Partial<OrderRow> = {}) => ({ ...base, ...overrides });
const totals = (rows: OrderRow[]) => computeMetrics(rows).totals;
describe("独立手算财务账本与边界（非LLM计算）", () => {
  it("增长率接受16位小数汇总和超安全整数金额", () => {
    expect(growthRate("0.0000000000000002", "0.0000000000000001").value).toBe(
      "1",
    );
    expect(
      growthRate("100000000000000000000", "50000000000000000000").value,
    ).toBe("1");
  });
  it("成交额：2×10.50=21", () =>
    expect(totals([row()]).gross_sales).toBe("21"));
  it("扣退款：21−2=19", () => expect(totals([row()]).net_sales).toBe("19"));
  it("可变成本：2×3+1+2+1=10", () =>
    expect(totals([row()]).known_variable_costs).toBe("10"));
  it("贡献毛益：19−10=9", () => expect(totals([row()]).contribution).toBe("9"));
  it("贡献率：9/19", () =>
    expect(totals([row()]).contribution_rate).toBe("0.47368421"));
  it("0.1+0.2精确等于0.3", () =>
    expect(
      totals([
        row({ unit_price: "0.1", quantity: "1", refund_amount: "0" }),
        row({
          row_id: "2",
          unit_price: "0.2",
          quantity: "1",
          refund_amount: "0",
        }),
      ]).gross_sales,
    ).toBe("0.3"));
  it("仅展示时四舍五入：0.005×2=0.01", () =>
    expect(
      money(
        totals([
          row({ quantity: "2", unit_price: "0.005", refund_amount: "0" }),
        ]).gross_sales,
      ),
    ).toBe("0.01"));
  it("小数数量精确乘法", () =>
    expect(
      totals([row({ quantity: "1.5", unit_price: "2.22", refund_amount: "0" })])
        .gross_sales,
    ).toBe("3.33"));
  it.each(["unit_cost", "shipping_cost", "platform_fee", "ad_cost"] as const)(
    "缺少%s不显示贡献毛益",
    (field) => expect(totals([row({ [field]: null })]).contribution).toBeNull(),
  );
  it("缺少退款不默认为0", () =>
    expect(totals([row({ refund_amount: null })]).net_sales).toBeNull());
  it("单价0合法", () =>
    expect(
      totals([row({ unit_price: "0", refund_amount: "0" })]).gross_sales,
    ).toBe("0"));
  it("销售额为0贡献率不可算", () =>
    expect(
      totals([row({ unit_price: "0", refund_amount: "0" })]).contribution_rate,
    ).toBeNull());
  it("贡献毛益可以为负数", () =>
    expect(
      totals([row({ unit_price: "1", refund_amount: "0" })]).contribution,
    ).toBe("-8"));
  it("取消单排除且保留计数", () => {
    const result = computeMetrics([
      row(),
      row({ row_id: "2", order_status: "cancelled" }),
    ]);
    expect(result.totals.gross_sales).toBe("21");
    expect(result.scope.cancelled).toBe(1);
  });
  it("退款单保留真实成本", () =>
    expect(
      totals([row({ order_status: "refunded", refund_amount: "21" })])
        .contribution,
    ).toBe("-10"));
  it("同订单多行保留金额，订单去重", () => {
    const result = computeMetrics([row(), row({ row_id: "2" })]);
    expect(result.totals.net_sales).toBe("38");
    expect(result.totals.order_count).toBe(1);
    expect(result.quality.duplicate_order_ids).toEqual(["A"]);
  });
  it("缺少ID只显示行均，不伪造订单数", () => {
    const result = totals([row({ order_id: null })]);
    expect(result.order_count).toBeNull();
    expect(result.average_order_value).toBeNull();
    expect(result.average_line_value).toBe("19");
  });
  it("客单价使用有效唯一订单数", () =>
    expect(
      totals([row(), row({ row_id: "2", order_id: "B", refund_amount: "0" })])
        .average_order_value,
    ).toBe("20"));
  it("渠道独立汇总", () =>
    expect(
      computeMetrics([row(), row({ row_id: "2", channel: "团购" })]).channels,
    ).toHaveLength(2));
  it("日期范围闭区间", () =>
    expect(
      computeMetrics([row(), row({ row_id: "2", order_date: "2026-10-02" })], {
        start: "2026-10-02",
        end: "2026-10-02",
      }).totals.net_sales,
    ).toBe("19"));
  it("渠道筛选不混入其他渠道", () =>
    expect(
      computeMetrics([row(), row({ row_id: "2", channel: "团购" })], {
        channel: "团购",
      }).totals.line_count,
    ).toBe(1));
  it("空数据不制造贡献率或订单数", () => {
    const value = totals([]);
    expect(value.contribution).toBeNull();
    expect(value.order_count).toBeNull();
    expect(value.average_line_value).toBeNull();
  });
  it("上期0且当期>0为新产生", () =>
    expect(growthRate("10", "0")).toEqual({ status: "new", value: null }));
  it("两个期间均为0不可比较", () =>
    expect(growthRate("0", "0")).toEqual({
      status: "unavailable",
      value: null,
    }));
  it("下降50%", () => expect(growthRate("5", "10").value).toBe("-0.5"));
  it("缺少完整14天不显示周比", () =>
    expect(computeMetrics([row()]).comparison.status).toBe("unavailable"));
  it("拒绝倒置日期", () =>
    expect(() =>
      computeMetrics([], { start: "2026-10-02", end: "2026-10-01" }),
    ).toThrow());
  it("拒绝不存在的筛选日期", () =>
    expect(() => computeMetrics([], { start: "2026-02-30" })).toThrow());
  it("拒绝重复行标识", () =>
    expect(() => computeMetrics([row(), row()])).toThrow());
  it("超出安全整数范围仍精确", () =>
    expect(
      totals([
        row({
          unit_price: "999999999999999999",
          quantity: "1",
          refund_amount: "0",
        }),
      ]).gross_sales,
    ).toBe("999999999999999999"));
  it("八位小数相乘保留16位", () =>
    expect(
      totals([
        row({
          quantity: "0.00000001",
          unit_price: "0.00000001",
          refund_amount: "0",
        }),
      ]).gross_sales,
    ).toBe("0.0000000000000001"));
  it("千分位和负数展示", () => expect(money("-1234.565")).toBe("-1,234.57"));
  it("固定种子样例完全一致", () =>
    expect(generateDemo()).toEqual(generateDemo()));
  it("三个场景的基础成交额一致", () =>
    expect(computeMetrics(generateDemo("normal")).totals.gross_sales).toBe(
      computeMetrics(generateDemo("low-contribution")).totals.gross_sales,
    ));
});
