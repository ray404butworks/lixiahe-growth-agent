// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { GrowthWorkspace } from "./growth-workspace";
import { marketingPlainText } from "./agent-workbench";
import { offlineDiagnosis } from "~/lib/agent/rules";
import { offlineMarketing } from "~/lib/agent/content";
import { demoContent } from "~/lib/agent/fixtures";
import type { ContentRequest, DiagnosisRequest } from "~/lib/agent/schema";
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
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/health")
        return Response.json({ model_configured: false });
      if (url === "/api/diagnose")
        return Response.json(
          offlineDiagnosis(JSON.parse(String(init?.body)) as DiagnosisRequest),
        );
      if (url === "/api/content")
        return Response.json(
          offlineMarketing(JSON.parse(String(init?.body)) as ContentRequest),
        );
      return new Response("not found", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function openDiagnosis() {
  render(<GrowthWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: /01 正常经营/ }));
  fireEvent.click(screen.getByRole("button", { name: /确认导入，查看看板/ }));
  fireEvent.click(screen.getByRole("button", { name: "经营诊断" }));
  fireEvent.click(screen.getByRole("button", { name: "一键经营诊断" }));
}
async function openFacts() {
  openDiagnosis();
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: "生成营销方案" }).length,
    ).toBeGreaterThan(0),
  );
  fireEvent.click(screen.getAllByRole("button", { name: "生成营销方案" })[0]!);
  fireEvent.change(screen.getByLabelText("选择商品"), {
    target: { value: "RICE-5KG" },
  });
}
describe("阶段三用户流程（组件环境）", () => {
  it("生成期间修改事实，旧响应不会填入新草稿", async () => {
    await openFacts();
    let finish: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "生成营销草稿" }));
    fireEvent.change(screen.getByLabelText("商品规格"), {
      target: { value: "10kg" },
    });
    await act(async () => {
      finish?.(Response.json(offlineMarketing(demoContent())));
    });
    expect(screen.queryByRole("heading", { name: "七日行动清单" })).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "生成营销草稿",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("无数据时诊断要求先导入", () => {
    render(<GrowthWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "经营诊断" }));
    expect(
      screen.getByRole("heading", { name: "诊断需要有效的经营数据" }),
    ).toBeTruthy();
  });
  it("无数据也能查看六张知识卡片", () => {
    render(<GrowthWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "本土知识" }));
    expect(screen.getAllByText("来源已核验")).toHaveLength(6);
  });
  it("完整诊断可见证据、假设和离线状态", async () => {
    openDiagnosis();
    await waitFor(() =>
      expect(screen.getAllByText("数据观察").length).toBeGreaterThanOrEqual(3),
    );
    expect(
      screen.getAllByText("可能原因 · 待验证").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      screen.getByText(/服务端API Key留空，当前使用离线规则/),
    ).toBeTruthy();
  });
  it("选建议、核对事实、生成三类草稿和七日清单", async () => {
    await openFacts();
    fireEvent.click(screen.getByRole("checkbox", { name: "我已核对商品名称" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "我已核对商品规格" }));
    fireEvent.click(screen.getByRole("button", { name: "生成营销草稿" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "七日行动清单" }),
      ).toBeTruthy(),
    );
    expect(screen.getByLabelText("编辑商品文案").textContent).toContain(
      "【待核对产地】",
    );
    expect(screen.getAllByText(/^DAY/)).toHaveLength(7);
    fireEvent.change(screen.getByLabelText("编辑商品文案"), {
      target: { value: "人工编辑后的商品文案" },
    });
    expect(screen.getByText("已人工编辑 · 仍待复核")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看经营报告" }));
    expect(
      screen.getByRole("heading", { name: "里下河 · 经营复盘报告" }),
    ).toBeTruthy();
    expect(screen.getByText(/人工编辑后的商品文案/)).toBeTruthy();
    expect(screen.getByRole("table", { name: "七日行动清单" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "下载 CSV 汇总" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "经营看板" }));
    fireEvent.change(screen.getByLabelText("销售渠道", { exact: true }), {
      target: { value: "微信私域" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "经营报告", exact: true }),
    );
    expect(screen.getByText(/当前筛选范围尚无诊断/)).toBeTruthy();
    expect(screen.queryByText(/人工编辑后的商品文案/)).toBeNull();
  });
  it("危险商品事实会阻止生成", async () => {
    await openFacts();
    fireEvent.change(screen.getByLabelText("商品名称", { exact: true }), {
      target: { value: "国家认证有机大米" },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "生成营销草稿",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("请修改");
  });
  it("改写事实后旧草稿立即失效", async () => {
    await openFacts();
    fireEvent.click(screen.getByRole("button", { name: "生成营销草稿" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "七日行动清单" }),
      ).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("商品规格", { exact: true }), {
      target: { value: "10kg" },
    });
    expect(screen.queryByRole("heading", { name: "七日行动清单" })).toBeNull();
  });
  it("复制内容保留草稿标志、来源及核对项", () => {
    const text = marketingPlainText(offlineMarketing(demoContent()));
    expect(text).toContain("AI辅助生成草稿");
    expect(text).toContain("【待核对产地】");
    expect(text).toContain("https://");
    expect(text).toContain("第7日");
  });
  it("清除数据后旧诊断不可继续使用", async () => {
    openDiagnosis();
    await waitFor(() =>
      expect(screen.getAllByText("数据观察").length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getByRole("button", { name: "数据导入" }));
    fireEvent.click(screen.getByRole("button", { name: "清除并重新导入" }));
    fireEvent.click(screen.getByRole("button", { name: "经营诊断" }));
    expect(
      screen.getByRole("heading", { name: "诊断需要有效的经营数据" }),
    ).toBeTruthy();
  });
});
