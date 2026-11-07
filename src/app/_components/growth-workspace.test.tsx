// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { GrowthWorkspace } from "./growth-workspace";
vi.mock("recharts", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Wrapper,
    AreaChart: Wrapper,
    BarChart: Wrapper,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Area: () => null,
    Bar: () => null,
  };
});
afterEach(cleanup);
function sample() {
  fireEvent.click(screen.getByRole("button", { name: /载入样例：正常经营/ }));
}
function confirm() {
  fireEvent.click(screen.getByRole("button", { name: /确认导入，查看看板/ }));
}
function upload(text: string, name = "sample.csv", size?: number) {
  const bytes = new TextEncoder().encode(text);
  const file = {
    name,
    size: size ?? bytes.byteLength,
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  };
  fireEvent.change(screen.getByLabelText("选择销售数据文件"), {
    target: { files: [file] },
  });
}
const header =
  "order_date,sku,product_name,channel,quantity,unit_price,order_status,refund_amount";
describe("阶段一二交互组件验收（JSDOM，不替代真实浏览器图表验收）", () => {
  it("黄金路径：样例→映射→确认→可信看板", () => {
    render(<GrowthWorkspace />);
    sample();
    expect(
      screen.getByRole("heading", { name: "确认字段，让数据对得上" }),
    ).toBeTruthy();
    confirm();
    expect(
      screen.getByRole("heading", { name: "经营看板", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("225,436.00")).toBeTruthy();
    expect(screen.getByText("76,684.00")).toBeTruthy();
  });
  it("缺少成本时不展示虚假毛益", () => {
    render(<GrowthWorkspace />);
    sample();
    fireEvent.change(screen.getByLabelText("映射单位进货成本"), {
      target: { value: "" },
    });
    confirm();
    expect(screen.getAllByText("数据不足").length).toBeGreaterThan(0);
    expect(screen.getByText(/缺少：单位进货成本/)).toBeTruthy();
  });
  it("没有订单ID显示行均而非客单价", () => {
    render(<GrowthWorkspace />);
    sample();
    fireEvent.change(screen.getByLabelText("映射订单编号"), {
      target: { value: "" },
    });
    confirm();
    expect(screen.getByText("不可确定")).toBeTruthy();
    expect(screen.getByText("行均金额")).toBeTruthy();
  });
  it("错误行必须明确同意剔除", async () => {
    render(<GrowthWorkspace />);
    upload(
      `${header}\n2026-10-01,RICE,大米,私域,1,10,paid,0\n2026-10-01,RICE,大米,私域,-1,10,paid,0`,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "确认字段，让数据对得上" }),
      ).toBeTruthy(),
    );
    const button = screen.getByRole("button", {
      name: /确认导入，查看看板/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /我已查看错误/ }));
    expect(button.disabled).toBe(false);
    confirm();
    expect(screen.getByText(/1行参与计算/)).toBeTruthy();
  });
  it("拒绝非CSV/XLSX且可以重新选择", async () => {
    render(<GrowthWorkspace />);
    upload("bad", "evil.exe");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("仅支持CSV"),
    );
    expect(screen.getByLabelText("选择销售数据文件")).toBeTruthy();
  });
  it("拒绝超过5MiB的文件", async () => {
    render(<GrowthWorkspace />);
    upload("", "big.csv", 5 * 1024 * 1024 + 1);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("超过5MB"),
    );
  });
  it("日期倒置时不渲染误导性的旧指标", () => {
    render(<GrowthWorkspace />);
    sample();
    confirm();
    fireEvent.change(screen.getByLabelText("开始日期"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.change(screen.getByLabelText("结束日期"), {
      target: { value: "2026-10-01" },
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "开始日期不能晚于结束日期",
    );
    expect(screen.queryByText("225,436.00")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "经营诊断" }));
    expect(screen.getByRole("heading", { name: "统计范围有误" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "调整统计范围" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "开始日期不能晚于结束日期",
    );
  });
  it("空看板载入样例仍需核对并确认导入", () => {
    render(<GrowthWorkspace initialView="dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: "使用演示样例" }));
    expect(
      screen.getByRole("heading", { name: "确认字段，让数据对得上" }),
    ).toBeTruthy();
    expect(screen.queryByText("225,436.00")).toBeNull();
    confirm();
    expect(screen.getByText("225,436.00")).toBeTruthy();
  });
  it.each(["经营诊断", "营销内容", "经营报告"])(
    "%s的空范围返回筛选且保留原销售数据",
    (view) => {
      render(<GrowthWorkspace />);
      sample();
      confirm();
      fireEvent.change(screen.getByLabelText("开始日期"), {
        target: { value: "2027-01-01" },
      });
      fireEvent.click(screen.getByRole("button", { name: view }));
      expect(
        screen.getByRole("heading", { name: "当前范围没有有效交易" }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "调整统计范围" }));
      expect(
        (screen.getByLabelText("开始日期") as HTMLInputElement).value,
      ).toBe("2027-01-01");
      expect(
        screen
          .getByLabelText("开始日期")
          .closest(".dashboard-filters")
          ?.getAttribute("data-expanded"),
      ).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
      expect(screen.getByText("225,436.00")).toBeTruthy();
    },
  );
  it("清除后数据不再可从看板访问", () => {
    render(<GrowthWorkspace />);
    sample();
    confirm();
    fireEvent.click(screen.getByRole("button", { name: "清除本次会话" }));
    fireEvent.click(screen.getByRole("button", { name: "经营看板" }));
    expect(
      screen.getByRole("heading", { name: "还没有销售数据" }),
    ).toBeTruthy();
  });
});
