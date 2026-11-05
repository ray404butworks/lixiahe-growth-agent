import { describe, expect, it, vi } from "vitest";
import { createAgentHandler } from "./http-handler";
import {
  BLANK_CONFIG,
  MOCK_CONFIG,
  demoRequest,
  demoContent,
} from "./fixtures";
import { offlineDiagnosis } from "./rules";
const request = (
  path: string,
  value: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`http://127.0.0.1:8080${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
describe("本地HTTP接口合同", () => {
  it("相同模型输入短时命中缓存，不再发出模型调用", async () => {
    const output = {
      recommendations: offlineDiagnosis(demoRequest()).recommendations.map(
        ({ observation: _observation, ...item }) => item,
      ),
    };
    const transport = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(output) } }],
      }),
    );
    const handler = createAgentHandler({ config: MOCK_CONFIG, transport });
    const input = { ...demoRequest(), allow_model: true };
    expect((await handler(request("/api/diagnose", input))).status).toBe(200);
    const second = await handler(request("/api/diagnose", input));
    expect((await second.json()).meta.cache_hit).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("模型每日调用限额耗尽后回退，仍返回可用建议", async () => {
    const transport = vi.fn<typeof fetch>();
    const handler = createAgentHandler({
      config: MOCK_CONFIG,
      transport,
      dailyLimit: 0,
    });
    const result = await handler(
      request("/api/diagnose", { ...demoRequest(), allow_model: true }),
    );
    const body = await result.json();
    expect(result.status).toBe(200);
    expect(body.meta.fallback_reason).toBe("budget_exceeded");
    expect(body.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(transport).not.toHaveBeenCalled();
  });
  it("health只返回配置状态、不返回Key", async () => {
    const result = await createAgentHandler({ config: BLANK_CONFIG })(
      new Request("http://127.0.0.1:8080/api/health"),
    );
    const json = await result.json();
    expect(json.model_configured).toBe(false);
    expect(JSON.stringify(json)).not.toContain("apiKey");
  });
  it("知识接口返回六张来源", async () => {
    const result = await createAgentHandler()(
      new Request("http://127.0.0.1:8080/api/knowledge"),
    );
    expect((await result.json()).cards).toHaveLength(6);
  });
  it("真实诊断接口重算指标，输出request_id", async () => {
    const result = await createAgentHandler({ config: BLANK_CONFIG })(
      request("/api/diagnose", demoRequest()),
    );
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.meta.request_id).toBe(result.headers.get("X-Request-ID"));
    expect(body.meta.mode).toBe("rules");
    expect(body.scope.input_rows).toBe(960);
  });
  it("营销接口无Key完整工作", async () => {
    const result = await createAgentHandler({ config: BLANK_CONFIG })(
      request("/api/content", demoContent()),
    );
    expect(result.status).toBe(200);
    expect((await result.json()).plan).toHaveLength(7);
  });
  it("拒绝跨站来源", async () =>
    expect(
      (
        await createAgentHandler()(
          request("/api/diagnose", demoRequest(), {
            Origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403));
  it("拒绝DNS重绑定Host", async () => {
    const result = await createAgentHandler()(
      new Request("http://evil.example/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(result.status).toBe(403);
  });
  it("拒绝非JSON", async () => {
    const result = await createAgentHandler()(
      new Request("http://127.0.0.1:8080/api/diagnose", {
        method: "POST",
        body: "body",
      }),
    );
    expect(result.status).toBe(415);
  });
  it("大小按实际流字节限制", async () =>
    expect(
      (
        await createAgentHandler({ bodyLimit: 8 })(
          request("/api/diagnose", demoRequest()),
        )
      ).status,
    ).toBe(413));
  it("未知字段不被当作可信指标或模型端点", async () => {
    const result = await createAgentHandler()(
      request("/api/diagnose", {
        ...demoRequest(),
        base_url: "https://evil.example",
        snapshot: { profit: "9999" },
      }),
    );
    expect(result.status).toBe(400);
    expect((await result.json()).code).toBe("VALIDATION");
  });
  it("不回显上传内容或密钥片段", async () => {
    const result = await createAgentHandler()(
      request("/api/diagnose", { rows: "private-secret-text" }),
    );
    expect(JSON.stringify(await result.json())).not.toContain(
      "private-secret-text",
    );
  });
  it("限流后返回429", async () => {
    const handler = createAgentHandler({ rateLimit: 1 });
    await handler(request("/api/diagnose", demoRequest()));
    expect(
      (await handler(request("/api/diagnose", demoRequest()))).status,
    ).toBe(429);
  });
  it("API Key留空从HTTP入口也不会外呼", async () => {
    const transport = vi.fn();
    const handler = createAgentHandler({ config: BLANK_CONFIG, transport });
    await handler(
      request("/api/diagnose", { ...demoRequest(), allow_model: true }),
    );
    expect(transport).not.toHaveBeenCalled();
  });
});
