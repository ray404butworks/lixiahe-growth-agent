import { KNOWLEDGE_CARDS } from "../knowledge/cards";
import type { Evidence } from "./evidence";
import {
  diagnosisModelSchema,
  marketingModelSchema,
  type ProductFacts,
} from "./schema";
const unsupported =
  /国家认证|有机认证|绿色食品认证|地理标志授权|兴化大闸蟹|兴化大米|最佳|最好|第一|唯一|顶级|零添加|治疗|治愈|降血糖|抗癌|保证.{0,8}(利润|收益|提升|增收)|必然|稳赚|翻倍|百分之/i;
const numericClaim =
  /[0-9０-９]|[零一二三四五六七八九十百千万亿两]+(?:元|件|单|倍|成|[%％])/;
const chineseFinancialNumber =
  /(?:销售额|营收|利润|毛益|退款金额|销量|增长率|贡献率).{0,4}[零〇一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]/;
const instructionLeak =
  /api\s*key|密钥|system\s*:|忽略.{0,8}(指令|规则)|泄露|<\/?script/i;
function proseSafe(text: string) {
  return (
    !numericClaim.test(text) &&
    !chineseFinancialNumber.test(text) &&
    !unsupported.test(text) &&
    !instructionLeak.test(text)
  );
}
export function validateDiagnosisModel(
  value: unknown,
  evidence: Record<string, Evidence>,
) {
  const parsed = diagnosisModelSchema.parse(value);
  if (
    new Set(parsed.recommendations.map((item) => item.id)).size !==
    parsed.recommendations.length
  )
    throw new Error("建议ID重复");
  for (const item of parsed.recommendations) {
    if (!item.evidence_metric_keys.every((key) => Object.hasOwn(evidence, key)))
      throw new Error("引用了快照不存在的指标");
    if (
      !item.knowledge_ids.every((id) =>
        KNOWLEDGE_CARDS.some(
          (card) => card.knowledge_id === id && card.status === "verified",
        ),
      )
    )
      throw new Error("引用了未知知识来源");
    for (const text of [
      item.title,
      item.hypothesis,
      item.action,
      item.expected_effect,
      item.risk_note,
    ])
      if (!proseSafe(text))
        throw new Error("模型包含未经核验的数字、认证断言或指令性内容");
  }
  return parsed;
}
export function validateMarketingModel(value: unknown, facts: ProductFacts) {
  const parsed = marketingModelSchema.parse(value);
  const texts = [
    parsed.video_title,
    parsed.product_copy,
    parsed.social_copy,
    ...parsed.video_segments.flatMap((segment) => [
      segment.visual,
      segment.narration,
    ]),
  ];
  const allowed = new Set([
    "name",
    "specification",
    "origin",
    "selling_point",
    "shipping",
  ]);
  for (const text of texts) {
    const tokens = [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map(
      (match) => match[1]!,
    );
    if (tokens.some((token) => !allowed.has(token)))
      throw new Error("模型使用未知商品事实占位符");
    const plain = text.replace(/\{\{[^{}]+\}\}/g, "");
    if (
      /[{}]/.test(plain) ||
      !proseSafe(plain) ||
      /产自|来自|原产|冷链|包邮|包活|顺丰|小时|到货|送达|高蛋白|非转基因|软糯|香甜|鲜活|营养丰富/.test(
        plain,
      )
    )
      throw new Error("模型擅自加入产地、配送或商品特性");
  }
  if (!facts.name_confirmed) {
    // Unconfirmed facts are rendered as pending placeholders, never asserted.
    if (!parsed.product_copy.includes("{{name}}"))
      throw new Error("文案缺少商品名称事实引用");
  }
  return parsed;
}
