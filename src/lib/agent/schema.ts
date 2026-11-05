import { z } from "zod";
import { orderSchema } from "../growth/contract";
const short = z.string().trim().min(1).max(180);
export const recommendationSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    title: z.string().min(1).max(60),
    priority: z.enum(["P1", "P2", "P3"]),
    evidence_metric_keys: z.array(z.string().min(1).max(500)).min(1).max(4),
    hypothesis: short,
    action: z.string().min(1).max(400),
    expected_effect: short,
    risk_note: short,
    knowledge_ids: z.array(z.string()).max(6),
  })
  .strict();
export const diagnosisModelSchema = z
  .object({ recommendations: z.array(recommendationSchema).min(3).max(5) })
  .strict();
export type RecommendationInput = z.infer<typeof recommendationSchema>;
export type Recommendation = RecommendationInput & { observation: string };
export const diagnosisRequestSchema = z
  .object({
    rows: z.array(orderSchema).min(1).max(10000),
    filters: z
      .object({
        start: z.string().optional(),
        end: z.string().optional(),
        channel: z.string().max(100).optional(),
      })
      .strict()
      .default({}),
    synthetic: z.boolean(),
    allow_model: z.boolean().default(false),
  })
  .strict();
export type DiagnosisRequest = z.infer<typeof diagnosisRequestSchema>;
export const factSchema = z
  .object({ value: z.string().trim().max(160), confirmed: z.boolean() })
  .strict();
export const productFactsSchema = z
  .object({
    sku: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    name_confirmed: z.boolean(),
    specification: factSchema,
    origin: factSchema,
    selling_point: factSchema,
    shipping: factSchema,
  })
  .strict();
export type ProductFacts = z.infer<typeof productFactsSchema>;
export const contentRequestSchema = diagnosisRequestSchema
  .extend({ facts: productFactsSchema, recommendation_id: z.string().max(40) })
  .strict();
export type ContentRequest = z.infer<typeof contentRequestSchema>;
export const marketingModelSchema = z
  .object({
    video_title: z.string().min(1).max(60),
    video_segments: z
      .array(
        z
          .object({ visual: short, narration: z.string().min(1).max(300) })
          .strict(),
      )
      .length(3),
    product_copy: z.string().min(1).max(800),
    social_copy: z.string().min(1).max(800),
  })
  .strict();
export type MarketingText = z.infer<typeof marketingModelSchema>;
export type AgentMode = "rules" | "model";
export type FallbackReason =
  | "key_missing"
  | "model_disabled"
  | "model_config_incomplete"
  | "model_timeout"
  | "model_failed"
  | "invalid_output"
  | "budget_exceeded"
  | "offline"
  | "not_authorized";
export type AgentMeta = {
  mode: AgentMode;
  fallback_reason: FallbackReason | null;
  attempts: number;
  snapshot_id: string;
  generated_at: string;
  request_id?: string;
  cache_hit?: boolean;
};
