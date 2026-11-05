import type { FallbackReason } from "./schema";
export type ModelConfig = {
  enabled: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
};
export class ModelError extends Error {
  constructor(public reason: FallbackReason) {
    super(reason);
  }
}
export function modelConfig(
  env: Record<string, string | undefined> = process.env,
): ModelConfig {
  return {
    enabled: env.LIXIAHE_MODEL_ENABLED === "true",
    apiKey: env.LIXIAHE_MODEL_API_KEY?.trim() ?? "",
    baseURL: env.LIXIAHE_MODEL_BASE_URL?.trim() ?? "",
    model: env.LIXIAHE_MODEL_NAME?.trim() ?? "",
    timeoutMs: Math.min(
      30000,
      Math.max(1000, Number(env.LIXIAHE_MODEL_TIMEOUT_MS) || 12000),
    ),
  };
}
export function unavailableReason(config: ModelConfig): FallbackReason | null {
  if (!config.apiKey) return "key_missing";
  if (!config.enabled) return "model_disabled";
  if (!config.baseURL || !config.model) return "model_config_incomplete";
  try {
    const url = new URL(config.baseURL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !config.model.match(/^[\w./:@-]{1,120}$/)
    )
      return "model_config_incomplete";
  } catch {
    return "model_config_incomplete";
  }
  return null;
}
export async function callModel(
  config: ModelConfig,
  system: string,
  payload: unknown,
  transport: typeof fetch = fetch,
): Promise<unknown> {
  const reason = unavailableReason(config);
  if (reason) throw new ModelError(reason);
  try {
    const response = await transport(
      `${config.baseURL.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: 1800,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: JSON.stringify({ untrusted_business_data: payload }),
            },
          ],
        }),
      },
    );
    if (!response.ok) throw new ModelError("model_failed");
    // Read in a bounded stream; a content-length header alone is not a limit.
    const reader = response.body?.getReader();
    if (!reader) throw new ModelError("invalid_output");
    let bytes = 0,
      text = "";
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 128 * 1024) {
        await reader.cancel();
        throw new ModelError("invalid_output");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const envelope = JSON.parse(text) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = envelope.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 16000)
      throw new ModelError("invalid_output");
    try {
      return JSON.parse(content);
    } catch {
      throw new ModelError("invalid_output");
    }
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      throw new ModelError("model_timeout");
    throw new ModelError("model_failed");
  }
}
