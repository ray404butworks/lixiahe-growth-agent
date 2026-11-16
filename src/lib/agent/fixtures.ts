// Synthetic fixtures for agent tests and local smoke checks only.
import { generateDemo } from "../growth/demo";
import type { ContentRequest, DiagnosisRequest } from "./schema";
import type { ModelConfig } from "./server-model";
/** 生成正常经营样例的诊断请求，供本地验证使用。 */
export function demoRequest(): DiagnosisRequest {
  return {
    rows: generateDemo(),
    filters: {},
    synthetic: true,
    allow_model: false,
  };
}
/** 用同一份测试账本生成与诊断匹配的营销请求。 */
export function demoContent(): ContentRequest {
  return {
    ...demoRequest(),
    recommendation_id: "test-product",
    facts: {
      sku: "RICE-5KG",
      name: "大米",
      name_confirmed: true,
      specification: { value: "5kg", confirmed: true },
      origin: { value: "兴化", confirmed: false },
      selling_point: { value: "小包装", confirmed: true },
      shipping: { value: "按商品页说明配送", confirmed: true },
    },
  };
}
export const BLANK_CONFIG: ModelConfig = {
  enabled: false,
  apiKey: "",
  baseURL: "",
  model: "",
  timeoutMs: 12000,
};
export const MOCK_CONFIG: ModelConfig = {
  enabled: true,
  apiKey: "unit-test-placeholder",
  baseURL: "https://model.example.test/v1",
  model: "test-model",
  timeoutMs: 1000,
};
