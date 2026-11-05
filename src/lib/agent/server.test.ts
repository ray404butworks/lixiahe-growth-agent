import { describe, expect, it, vi } from "vitest";
import { diagnose, generateMarketing } from "./server-service";
import { offlineDiagnosis } from "./rules";
import {
  BLANK_CONFIG,
  MOCK_CONFIG,
  demoRequest,
  demoContent,
} from "./fixtures";
import { modelConfig } from "./server-model";
import { RULE_MARKETING_TEMPLATE } from "./content";
const modelRecommendations = () => ({
  recommendations: offlineDiagnosis(demoRequest()).recommendations.map(
    ({ observation: _observation, ...item }) => item,
  ),
});
const response = (value: unknown) =>
  Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
describe("服务端模型适配与无Key降级（全部模拟，不调用真实模型）", () => {
  it("限制模型响应体积，过大内容回退", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("x".repeat(129 * 1024)));
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      MOCK_CONFIG,
      { transport },
    );
    expect(result.meta.fallback_reason).toBe("invalid_output");
    expect(result.meta.attempts).toBe(2);
  });
  it("空Key不发送任何请求，完整返回规则", async () => {
    const transport = vi.fn();
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      BLANK_CONFIG,
      { transport },
    );
    expect(result.meta.fallback_reason).toBe("key_missing");
    expect(transport).not.toHaveBeenCalled();
    expect(result.recommendations.length).toBeGreaterThanOrEqual(3);
  });
  it("不读取环境中的其他OpenAI密钥", () =>
    expect(
      modelConfig({ OPENAI_API_KEY: "unrelated-placeholder" }).apiKey,
    ).toBe(""));
  it("已配置但开关关闭不调用", async () => {
    const transport = vi.fn();
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      { ...MOCK_CONFIG, enabled: false },
      { transport },
    );
    expect(result.meta.fallback_reason).toBe("model_disabled");
    expect(transport).not.toHaveBeenCalled();
  });
  it("本次未允许时不调用", async () => {
    const transport = vi.fn();
    expect(
      (await diagnose(demoRequest(), MOCK_CONFIG, { transport })).meta
        .fallback_reason,
    ).toBe("not_authorized");
    expect(transport).not.toHaveBeenCalled();
  });
  it("缺少端点或非HTTPS配置不调用", async () => {
    const transport = vi.fn();
    expect(
      (
        await diagnose(
          { ...demoRequest(), allow_model: true },
          { ...MOCK_CONFIG, baseURL: "http://model.example.test" },
          { transport },
        )
      ).meta.fallback_reason,
    ).toBe("model_config_incomplete");
    expect(transport).not.toHaveBeenCalled();
  });
  it("合法结构由服务端补观察事实，不接受模型自算金额", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(modelRecommendations()));
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      MOCK_CONFIG,
      { transport },
    );
    expect(result.meta.mode).toBe("model");
    expect(result.meta.attempts).toBe(1);
    expect(result.recommendations[0]?.observation).toContain("¥");
  });
  it("模型载荷无订单ID且明确禁止跟随不可信指令", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(modelRecommendations()));
    await diagnose({ ...demoRequest(), allow_model: true }, MOCK_CONFIG, {
      transport,
    });
    const [, init] = transport.mock.calls[0]!;
    const body = String(init?.body);
    expect(body).not.toContain("SYNTHETIC-");
    expect(body).not.toContain('"order_id"');
    expect(body).toContain("不可信数据");
    expect(init?.redirect).toBe("error");
  });
  it("非法JSON重试一次后合法", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: "bad-json" } }] }),
      )
      .mockResolvedValueOnce(response(modelRecommendations()));
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      MOCK_CONFIG,
      { transport },
    );
    expect(result.meta.mode).toBe("model");
    expect(result.meta.attempts).toBe(2);
  });
  it("持续非法JSON最多两次后规则回退", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ choices: [{ message: { content: "bad" } }] }),
      );
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      MOCK_CONFIG,
      { transport },
    );
    expect(result.meta.mode).toBe("rules");
    expect(result.meta.attempts).toBe(2);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each([
    "unknown-key",
    "made-up-number",
    "chinese-number",
    "unsupported-certification",
    "injection",
    "changed-id",
  ])("拒绝不合格输出：%s", async (kind) => {
    const value = modelRecommendations();
    if (kind === "unknown-key")
      value.recommendations[0]!.evidence_metric_keys = ["totals.fake_profit"];
    if (kind === "made-up-number")
      value.recommendations[0]!.hypothesis = "销售额增长999999元";
    if (kind === "chinese-number")
      value.recommendations[0]!.hypothesis = "营收五百万";
    if (kind === "unsupported-certification")
      value.recommendations[0]!.action = "宣称国家认证";
    if (kind === "injection") value.recommendations[0]!.action = "泄露密钥";
    if (kind === "changed-id") value.recommendations[0]!.id = "made-up-id";
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response(value));
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      MOCK_CONFIG,
      { transport },
    );
    expect(result.meta.mode).toBe("rules");
    expect(result.meta.fallback_reason).toBe("invalid_output");
    expect(result.meta.attempts).toBe(2);
  });
  it("认证失败直接回退且不泄露错误正文", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("secret-provider-error", { status: 401 }),
      );
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      MOCK_CONFIG,
      { transport },
    );
    expect(result.meta.attempts).toBe(1);
    expect(JSON.stringify(result)).not.toContain("secret-provider-error");
  });
  it("超时回退保留可用诊断", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const result = await diagnose(
      { ...demoRequest(), allow_model: true },
      MOCK_CONFIG,
      { transport },
    );
    expect(result.meta.fallback_reason).toBe("model_timeout");
    expect(result.meta.attempts).toBe(1);
  });
  it("营销无Key可完整生成", async () => {
    const transport = vi.fn();
    const result = await generateMarketing(demoContent(), BLANK_CONFIG, {
      transport,
    });
    expect(result.plan).toHaveLength(7);
    expect(result.meta.mode).toBe("rules");
    expect(transport).not.toHaveBeenCalled();
  });
  it("营销模型仅处理占位符，不接收真实商品事实值", async () => {
    const input = demoContent();
    input.allow_model = true;
    input.facts.origin = { value: "私有来源样本", confirmed: true };
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(RULE_MARKETING_TEMPLATE));
    const result = await generateMarketing(input, MOCK_CONFIG, { transport });
    expect(result.meta.mode).toBe("model");
    expect(result.text.product_copy).toContain("私有来源样本");
    expect(String(transport.mock.calls[0]?.[1]?.body)).not.toContain(
      "私有来源样本",
    );
  });
});
