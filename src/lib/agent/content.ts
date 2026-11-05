import type { Diagnosis } from "./rules";
import { offlineDiagnosis } from "./rules";
import {
  contentRequestSchema,
  type ContentRequest,
  type MarketingText,
  type AgentMeta,
  type ProductFacts,
} from "./schema";
import { knowledgeForProduct } from "../knowledge/cards";
import { computeMetrics } from "../growth/metrics";
export const AI_DRAFT_LABEL =
  "AI辅助生成草稿 · 发布前请核对商品事实、来源与平台规则";
const restricted =
  /国家认证|有机|绿色食品|非转基因|官方推荐|获奖|金奖|organic|certified|cures|地理标志|兴化大闸蟹|兴化大米|最佳|最好|第一|唯一|顶级|零添加|百分之百|100[%％]|治疗|治愈|降血糖|降三高|抗癌|保健功效|忽略.{0,8}(指令|规则)|泄露|密钥|api\s*key|<\/?script|system\s*:/i;
export function factViolations(facts: ProductFacts): string[] {
  const fields = {
    name: facts.name,
    specification: facts.specification.value,
    origin: facts.origin.value,
    selling_point: facts.selling_point.value,
    shipping: facts.shipping.value,
  };
  return Object.entries(fields)
    .filter(([, value]) => restricted.test(value))
    .map(([key]) => key);
}
export type MarketingDraft = {
  meta: AgentMeta;
  label: string;
  text: MarketingText;
  recommendation_id: string;
  facts_used: string[];
  missing_facts: string[];
  warnings: string[];
  knowledge_ids: string[];
  plan: { day: number; action: string; evidence_metric_keys: string[] }[];
};
export function factValues(facts: ProductFacts) {
  return {
    name: facts.name_confirmed ? facts.name : "【待核对商品名称】",
    specification:
      facts.specification.confirmed && facts.specification.value
        ? facts.specification.value
        : "【待核对规格】",
    origin:
      facts.origin.confirmed && facts.origin.value
        ? facts.origin.value
        : "【待核对产地】",
    selling_point:
      facts.selling_point.confirmed && facts.selling_point.value
        ? facts.selling_point.value
        : "【待核对商品特点】",
    shipping:
      facts.shipping.confirmed && facts.shipping.value
        ? facts.shipping.value
        : "【待核对配送说明】",
  };
}
export function renderMarketing(
  template: MarketingText,
  facts: ProductFacts,
): MarketingText {
  const values = factValues(facts);
  const render = (text: string) =>
    text.replace(
      /\{\{(name|specification|origin|selling_point|shipping)\}\}/g,
      (_, key: keyof typeof values) => values[key],
    );
  return {
    video_title: render(template.video_title),
    video_segments: template.video_segments.map((segment) => ({
      visual: render(segment.visual),
      narration: render(segment.narration),
    })),
    product_copy: render(template.product_copy),
    social_copy: render(template.social_copy),
  };
}
export const RULE_MARKETING_TEMPLATE: MarketingText = {
  video_title: "把{{name}}讲清楚，再做选择",
  video_segments: [
    {
      visual: "展示本批商品实物与原始包装，画面不要添加认证标志。",
      narration: "今天带你看这款{{name}}，先把商品本身看清楚。",
    },
    {
      visual: "拍摄规格标签和商品细节，信息按商家核对内容呈现。",
      narration:
        "规格是{{specification}}。产地：{{origin}}。商品特点：{{selling_point}}。",
    },
    {
      visual: "展示商品页与真实配送说明，引导用户先咨询。",
      narration:
        "配送说明：{{shipping}}。想了解是否适合自己的需求，欢迎先咨询核对。",
    },
  ],
  product_copy:
    "{{name}}\n商品规格：{{specification}}\n产地信息：{{origin}}\n商品特点：{{selling_point}}\n配送说明：{{shipping}}\n购买前请核对商品页与本批实物标签。",
  social_copy:
    "这次想把{{name}}介绍清楚：{{specification}}，{{selling_point}}。来源信息为{{origin}}；配送请看{{shipping}}。有疑问先聊聊，确认适合再下单。",
};
export function prepareMarketing(
  input: ContentRequest,
  diagnosis: Diagnosis,
  template = RULE_MARKETING_TEMPLATE,
): MarketingDraft {
  const violations = factViolations(input.facts);
  if (violations.length)
    throw new Error(
      "商品事实含未经人工核实的认证、功效、受保护名称或指令性内容，请修改相关字段。",
    );
  if (
    !computeMetrics(input.rows, input.filters).skus.some(
      (group) => group.key === input.facts.sku,
    )
  )
    throw new Error("所选SKU没有有效交易，请重新选择。");
  const recommendation = diagnosis.recommendations.find(
    (item) => item.id === input.recommendation_id,
  );
  if (!recommendation) throw new Error("所选建议已失效，请重新诊断后选择。");
  const values = factValues(input.facts);
  const facts_used = Object.entries(values)
    .filter(([, value]) => !value.startsWith("【待核对"))
    .map(([key]) => key);
  const missing_facts = Object.keys(values).filter(
    (key) => !facts_used.includes(key),
  );
  const actions = [
    "核对本批商品标签、规格、来源与配送信息，补齐未确认项。",
    "按所选建议复核渠道费用或售后记录，记录仍缺少的数据。",
    "检查并编辑短视频脚本和商品文案，删除全部未核对占位内容。",
    "在同一条件下开展小范围内容测试，由商家人工决定是否发布。",
    "收集去标识化的咨询与售后反馈，避免把少量反馈当作因果结论。",
    "按同口径补录销售、退款与成本，整理本次行动记录。",
    "导入新期间数据再对照复盘，记录效果与不确定性，不预设增收。",
  ];
  return {
    meta: { ...diagnosis.meta, generated_at: new Date().toISOString() },
    label: AI_DRAFT_LABEL,
    text: renderMarketing(template, input.facts),
    recommendation_id: recommendation.id,
    facts_used,
    missing_facts,
    warnings: [
      ...(input.synthetic
        ? ["当前使用合成交易，不能作为真实企业经营案例。"]
        : []),
      ...(missing_facts.length ? ["带【待核对】的内容不能直接发布。"] : []),
      "商家勾选仅代表自行确认，不是本系统完成认证审核。",
      "文案编辑后仍需人工复核；本系统不会自动发布。",
    ],
    knowledge_ids: knowledgeForProduct(input.facts.name).map(
      (card) => card.knowledge_id,
    ),
    plan: actions.map((action, index) => ({
      day: index + 1,
      action,
      evidence_metric_keys: [...recommendation.evidence_metric_keys],
    })),
  };
}
export function offlineMarketing(input: ContentRequest): MarketingDraft {
  const parsed = contentRequestSchema.parse(input);
  return prepareMarketing(parsed, offlineDiagnosis(parsed));
}
