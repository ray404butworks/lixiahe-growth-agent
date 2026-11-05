import { offlineDiagnosis, type Diagnosis } from "./rules";
import { offlineMarketing, type MarketingDraft } from "./content";
import type { ContentRequest, DiagnosisRequest } from "./schema";
export class AgentRequestError extends Error {}
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
