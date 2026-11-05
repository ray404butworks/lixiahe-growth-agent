import { describe, expect, it } from "vitest";
import { parseCSV } from "../csv-parser";
import { autoMap } from "./contract";
import { normalizeDate, normalizeOrders } from "./import";
import { generateDemo, rowsToCSV } from "./demo";
const csv =
  "订单日期,SKU,商品名称,渠道,数量,单价,订单状态,退款金额\n2026-10-01,RICE,大米,私域,2,10.5,已支付,0";
function run(value = csv, assumePaid = false, assumeNoRefund = false) {
  const data = parseCSV(value);
  return normalizeOrders(data, autoMap(data.headers), {
    assumePaid,
    assumeNoRefund,
  });
}
describe("导入映射和数据质量", () => {
  it("识别中文表头", () => expect(run().rows).toHaveLength(1));
  it("成本缺失保留null", () => expect(run().rows[0]?.ad_cost).toBeNull());
  it("负数量被剔除并说明字段", () => {
    const result = run(csv.replace(",2,10.5,", ",-1,10.5,"));
    expect(result.quality.rejected_rows).toBe(1);
    expect(result.quality.issues[0]?.field).toBe("quantity");
  });
  it("数量0无效", () =>
    expect(run(csv.replace(",2,10.5,", ",0,10.5,")).quality.rejected_rows).toBe(
      1,
    ));
  it("退款超成交拒绝", () =>
    expect(
      run(csv.replace("已支付,0", "已退款,22")).quality.rejected_rows,
    ).toBe(1));
  it("非法日期拒绝", () =>
    expect(
      run(csv.replace("2026-10-01", "2026-02-30")).quality.rejected_rows,
    ).toBe(1));
  it("空状态须确认", () =>
    expect(run(csv.replace("已支付", "")).quality.rejected_rows).toBe(1));
  it("明确确认后空状态按paid", () =>
    expect(run(csv.replace("已支付", ""), true).rows[0]?.order_status).toBe(
      "paid",
    ));
  it("空退款不默认为0", () =>
    expect(
      run(csv.replace("已支付,0", "已支付,")).rows[0]?.refund_amount,
    ).toBeNull());
  it("明确确认后空退款按0", () =>
    expect(
      run(csv.replace("已支付,0", "已支付,"), false, true).rows[0]
        ?.refund_amount,
    ).toBe("0"));
  it("未知状态不猜测", () =>
    expect(run(csv.replace("已支付", "待发货")).quality.rejected_rows).toBe(1));
  it("缺少必需映射阻止确认", () => {
    const data = parseCSV(csv);
    expect(() =>
      normalizeOrders(data, {}, { assumePaid: false, assumeNoRefund: false }),
    ).toThrow("必需字段");
  });
  it("重复映射阻止确认", () => {
    const data = parseCSV(csv);
    expect(() =>
      normalizeOrders(
        data,
        { ...autoMap(data.headers), sku: "商品名称" },
        { assumePaid: false, assumeNoRefund: false },
      ),
    ).toThrow("同一源列");
  });
  it("Excel日期45659对应2025-01-02", () =>
    expect(normalizeDate("45659")).toBe("2025-01-02"));
  it("非法Excel闰日60不转换", () => expect(normalizeDate("60")).toBe("60"));
  it("ISO带时间转换为订单标注日", () =>
    expect(normalizeDate("2026-10-01T08:00:00Z")).toBe("2026-10-01"));
  it("不猜测01/02/2026", () =>
    expect(normalizeDate("01/02/2026")).toBe("01/02/2026"));
  it("960行样例可往返导入", () => {
    const result = run(rowsToCSV(generateDemo()));
    expect(result.quality.valid_rows).toBe(960);
    expect(result.quality.rejected_rows).toBe(0);
  });
  it("中文模板可往返导入", () =>
    expect(run(rowsToCSV(generateDemo(), true)).quality.valid_rows).toBe(960));
  it("空文件可恢复错误", () => expect(() => run("")).toThrow("没有数据行"));
  it("超过1万行拒绝", () => {
    const data = parseCSV(csv);
    data.rows = Array.from({ length: 10001 }, () => data.rows[0]!);
    expect(() =>
      normalizeOrders(data, autoMap(data.headers), {
        assumePaid: false,
        assumeNoRefund: false,
      }),
    ).toThrow("10,000");
  });
});
