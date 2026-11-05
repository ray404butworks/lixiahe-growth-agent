import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentRequestError,
  requestDiagnosis,
  requestMarketing,
} from "./client";
import { demoRequest, demoContent } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
describe("浏览器请求与明确降级", () => {
  it("网络断开诊断标记为离线规则", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const result = await requestDiagnosis(demoRequest());
    expect(result.meta.mode).toBe("rules");
    expect(result.meta.fallback_reason).toBe("offline");
  });
  it("网络断开仍有完整营销草稿", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const result = await requestMarketing(demoContent());
    expect(result.text.video_segments).toHaveLength(3);
    expect(result.meta.fallback_reason).toBe("offline");
  });
  it("400业务拒绝不得伪装成成功降级", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "事实需要修改" }, { status: 400 }),
        ),
    );
    await expect(requestMarketing(demoContent())).rejects.toBeInstanceOf(
      AgentRequestError,
    );
  });
  it("429限流必须显示错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "稍后再试" }, { status: 429 }),
        ),
    );
    await expect(requestDiagnosis(demoRequest())).rejects.toThrow("稍后再试");
  });
  it("取消任务不得写入旧规则结果", async () => {
    const abort = new AbortController();
    abort.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError")),
    );
    await expect(
      requestDiagnosis(demoRequest(), abort.signal),
    ).rejects.toThrow();
  });
  it("静态服务404时明确降级", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not found", { status: 404 })),
    );
    expect((await requestDiagnosis(demoRequest())).meta.fallback_reason).toBe(
      "offline",
    );
  });
});
