import { z } from "zod";
import { diagnose, generateMarketing } from "./server-service";
import {
  modelConfig,
  ModelError,
  unavailableReason,
  type ModelConfig,
} from "./server-model";
import { contentRequestSchema, diagnosisRequestSchema } from "./schema";
import { KNOWLEDGE_CARDS } from "../knowledge/cards";
type HandlerOptions = {
  config?: ModelConfig;
  transport?: typeof fetch;
  bodyLimit?: number;
  rateLimit?: number;
  dailyLimit?: number;
  allowedOrigins?: string[];
  now?: () => number;
};
const LIMIT = 8 * 1024 * 1024;
class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
async function readJSON(request: Request, maxBytes: number): Promise<unknown> {
  if (
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "CONTENT_TYPE", "请使用JSON请求。");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "EMPTY_BODY", "请求内容为空。");
  let size = 0,
    text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(
          413,
          "BODY_TOO_LARGE",
          "请求超过允许大小，请减少订单行数。",
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_JSON", "JSON内容或编码无效。");
  }
}
export function createAgentHandler(options: HandlerOptions = {}) {
  const config = options.config ?? modelConfig();
  const configuredDaily = Number(process.env.LIXIAHE_MODEL_DAILY_CALLS ?? 20);
  const dailyLimit =
    options.dailyLimit ??
    (Number.isFinite(configuredDaily)
      ? Math.max(0, Math.min(1000, configuredDaily))
      : 20);
  let quotaDate = "",
    calls = 0;
  const transport: typeof fetch = async (input, init) => {
    const date = new Date((options.now ?? Date.now)() + 8 * 3600000)
      .toISOString()
      .slice(0, 10);
    if (date !== quotaDate) {
      quotaDate = date;
      calls = 0;
    }
    if (calls >= dailyLimit) throw new ModelError("budget_exceeded");
    calls++;
    return (options.transport ?? fetch)(input, init);
  };
  type Result =
    | Awaited<ReturnType<typeof diagnose>>
    | Awaited<ReturnType<typeof generateMarketing>>;
  const cache = new Map<string, { expires: number; result: Result }>();
  let windowStart = 0,
    count = 0;
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const json = (body: unknown, status = 200) =>
      Response.json(body, {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Request-ID": requestId,
        },
      });
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, "");
      if (
        !["127.0.0.1", "localhost", "[::1]", "terminal.local"].includes(
          url.hostname,
        )
      )
        throw new HttpError(403, "HOST", "此开发服务仅允许本机访问。");
      if (request.method === "GET" && path === "/api/health")
        return json({
          mode: unavailableReason(config) ? "rules" : "model-ready",
          model_configured: !unavailableReason(config),
          reason: unavailableReason(config),
          version: "0.3.0",
          request_id: requestId,
        });
      if (request.method === "GET" && path === "/api/knowledge")
        return json({ cards: KNOWLEDGE_CARDS, request_id: requestId });
      if (!["/api/diagnose", "/api/content"].includes(path))
        throw new HttpError(404, "NOT_FOUND", "接口不存在。");
      if (request.method !== "POST")
        throw new HttpError(405, "METHOD", "此接口需要POST请求。");
      const origin = request.headers.get("origin");
      if (
        origin &&
        origin !== url.origin &&
        !options.allowedOrigins?.includes(origin)
      )
        throw new HttpError(403, "ORIGIN", "不接受跨站请求。");
      if (
        request.headers.get("sec-fetch-site") === "cross-site" &&
        (!origin || !options.allowedOrigins?.includes(origin))
      )
        throw new HttpError(403, "ORIGIN", "不接受跨站请求。");
      const now = (options.now ?? Date.now)();
      if (!windowStart || now - windowStart >= 60000) {
        windowStart = now;
        count = 0;
      }
      if (++count > (options.rateLimit ?? 30))
        throw new HttpError(429, "RATE_LIMIT", "操作过于频繁，请稍后再试。");
      const body = await readJSON(request, options.bodyLimit ?? LIMIT);
      const input =
        path === "/api/diagnose"
          ? diagnosisRequestSchema.parse(body)
          : contentRequestSchema.parse(body);
      let cacheKey = "";
      if (input.allow_model && !unavailableReason(config)) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(input)),
        );
        cacheKey = `${path}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expires > now)
          return json({
            ...cached.result,
            meta: {
              ...cached.result.meta,
              cache_hit: true,
              request_id: requestId,
            },
          });
      }
      const result =
        path === "/api/diagnose"
          ? await diagnose(diagnosisRequestSchema.parse(input), config, {
              transport,
            })
          : await generateMarketing(contentRequestSchema.parse(input), config, {
              transport,
            });
      if (cacheKey && result.meta.mode === "model") {
        if (cache.size >= 8) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { expires: now + 5 * 60000, result });
      }
      return json({
        ...result,
        meta: { ...result.meta, request_id: requestId },
      });
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          {
            code: error.code,
            message: error.message,
            details: [],
            request_id: requestId,
          },
          error.status,
        );
      if (error instanceof z.ZodError)
        return json(
          {
            code: "VALIDATION",
            message: "请求字段不完整或格式错误。",
            details: error.issues.slice(0, 20).map((issue) => ({
              field: issue.path.join("."),
              code: issue.code,
            })),
            request_id: requestId,
          },
          400,
        );
      // Do not echo unknown exceptions, credentials, uploaded strings or provider bodies.
      return json(
        {
          code: "BUSINESS_VALIDATION",
          message: "无法完成请求，请检查当前交易范围、所选建议和商品事实。",
          details: [],
          request_id: requestId,
        },
        400,
      );
    }
  };
}
