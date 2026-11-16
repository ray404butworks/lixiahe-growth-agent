import { offlineDiagnosis, type Diagnosis } from "./rules";
import { offlineMarketing, type MarketingDraft } from "./content";
import type { ContentRequest, DiagnosisRequest } from "./schema";
export class AgentRequestError extends Error {}
/** 向本地服务发出可取消的 JSON 请求，并将错误转换成界面可读的消息。 */
async function requestJSON<T>(
  path: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(65000)])
      : AbortSignal.timeout(65000),
  });
  if ([400, 403, 413, 415, 429].includes(response.status)) {
    const body = (await response.json()) as { message?: string };
    throw new AgentRequestError(
      body.message ?? "请求不符合当前接口约束，请检查输入。",
    );
  }
  if (!response.ok) throw new Error("服务暂不可用");
  const result = (await response.json()) as T & { meta?: { mode?: string } };
  if (!result.meta || !["rules", "model"].includes(result.meta.mode ?? ""))
    throw new Error("接口结果不完整");
  return result;
}
/** 请求经营诊断，按需回退到浏览器内的规则诊断。 */
export async function requestDiagnosis(
  input: DiagnosisRequest,
  signal?: AbortSignal,
): Promise<Diagnosis> {
  try {
    return await requestJSON<Diagnosis>("/api/diagnose", input, signal);
  } catch (error) {
    if (signal?.aborted || error instanceof AgentRequestError) throw error;
    const result = offlineDiagnosis(input);
    return { ...result, meta: { ...result.meta, fallback_reason: "offline" } };
  }
}
/** 请求营销草稿，按需回退到浏览器内的规则草稿。 */
export async function requestMarketing(
  input: ContentRequest,
  signal?: AbortSignal,
): Promise<MarketingDraft> {
  try {
    return await requestJSON<MarketingDraft>("/api/content", input, signal);
  } catch (error) {
    if (signal?.aborted || error instanceof AgentRequestError) throw error;
    const result = offlineMarketing(input);
    return { ...result, meta: { ...result.meta, fallback_reason: "offline" } };
  }
}
