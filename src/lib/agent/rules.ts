import { computeMetrics, type MetricSnapshot } from "../growth/metrics";
import { evidenceRegistry, snapshotId } from "./evidence";
import type {
  AgentMeta,
  DiagnosisRequest,
  Recommendation,
  RecommendationInput,
} from "./schema";
import { KNOWLEDGE_CARDS } from "../knowledge/cards";
export type Diagnosis = {
  meta: AgentMeta;
  summary: string;
  recommendations: Recommendation[];
  missing_data: string[];
  evidence: ReturnType<typeof evidenceRegistry>;
  scope: MetricSnapshot["scope"];
  synthetic: boolean;
  knowledge_ids: string[];
};
export function withObservation(
  input: RecommendationInput,
  registry: ReturnType<typeof evidenceRegistry>,
): Recommendation {
  return {
    ...input,
    observation: input.evidence_metric_keys
      .map((key) => `${registry[key]!.label}：${registry[key]!.display}`)
      .join("；"),
  };
}
export function rulesFromSnapshot(
  snapshot: MetricSnapshot,
  synthetic: boolean,
): Diagnosis {
  const registry = evidenceRegistry(snapshot);
  const recommendations: RecommendationInput[] = [];
  const add = (recommendation: RecommendationInput) =>
    recommendations.push(recommendation);
  if (snapshot.totals.missing_fields.length)
    add({
      id: "complete-costs",
      title: "先补齐成本与退款口径",
      priority: "P1",
      evidence_metric_keys: ["totals.gross_sales", "totals.line_count"],
      hypothesis: "部分经营字段尚待补齐。",
      action:
        "逐项核对进货成本、行分摊费用和退款金额；明确没有发生的费用再填写零。",
      expected_effect: "提高指标可解释性，经营收益仍待验证。",
      risk_note: "不能把已知成本当作全部成本，也不能把贡献毛益当净利润。",
      knowledge_ids: ["K03"],
    });
  const weakest = snapshot.channels
    .filter((group) => group.contribution_rate !== null)
    .sort(
      (a, b) => Number(a.contribution_rate) - Number(b.contribution_rate),
    )[0];
  if (weakest)
    add({
      id: "review-channel",
      title: "复核贡献较弱渠道的费用",
      priority: "P1",
      evidence_metric_keys: [
        `channel.${encodeURIComponent(weakest.key)}.net_sales`,
        `channel.${encodeURIComponent(weakest.key)}.contribution_rate`,
      ],
      hypothesis: "可能与投流、平台费用或商品组合有关，需要拆分后验证原因。",
      action:
        "复核该渠道的行分摊费用，选取同类商品与其他渠道对照；先做小范围调整再复盘。",
      expected_effect: "验证哪些费用或组合值得调整，不承诺利润提升。",
      risk_note: "不同渠道可能承担获客等不同目标，不能仅按贡献率直接停投。",
      knowledge_ids: ["K03"],
    });
  const refundSku = [...snapshot.skus]
    .filter((group) => group.known_refunds !== "0")
    .sort((a, b) => Number(b.known_refunds) - Number(a.known_refunds))[0];
  if (refundSku)
    add({
      id: "review-refunds",
      title: "追踪退款较多商品的原因",
      priority: "P1",
      evidence_metric_keys: [
        `sku.${encodeURIComponent(refundSku.key)}.gross_sales`,
        `sku.${encodeURIComponent(refundSku.key)}.known_refunds`,
      ],
      hypothesis: "可能存在物流、商品预期或售后解释差异。",
      action:
        "按授权的去标识化售后记录归类原因，核对发货说明和商品页面，再观察后续变化。",
      expected_effect: "找到需要验证的退款原因，效果以后续样本衡量。",
      risk_note: "这是退款金额对照，不是退款订单率或归因结论。",
      knowledge_ids: /蟹/.test(refundSku.name) ? ["K04", "K06"] : ["K03"],
    });
  add({
    id: "test-product",
    title: "用小范围商品内容测试验证需求",
    priority: "P2",
    evidence_metric_keys: [
      snapshot.totals.net_sales === null
        ? "totals.gross_sales"
        : "totals.net_sales",
      "totals.quantity",
    ],
    hypothesis: "渠道和商品呈现方式可能影响转化，应通过同条件测试验证。",
    action:
      "选择一款商品，先核实规格、来源和配送说明，再比较两种文案的咨询与成交反馈。",
    expected_effect: "积累能复用的内容反馈，不预设增收比例。",
    risk_note: "地方品牌资料不证明商家授权，未经确认的信息不得写成商品事实。",
    knowledge_ids: ["K01", "K02"],
  });
  add({
    id: "weekly-review",
    title: "建立同口径的周度复盘",
    priority: "P3",
    evidence_metric_keys: ["totals.line_count", "totals.gross_sales"],
    hypothesis: "当前快照只能说明所选期间，需要连续同口径记录才能评价行动。",
    action:
      "记录本期动作和下期对照口径，分别观察销量、扣退款销售额与完整成本，保留数据缺口。",
    expected_effect: "形成可追溯的经营判断，是否改善需要实际复盘。",
    risk_note: "缺少固定成本和税费，不能从本工具推断净利润。",
    knowledge_ids: ["K03"],
  });
  const picked = recommendations
    .slice(0, 5)
    .map((item) => withObservation(item, registry));
  const usedKeys = [
    ...new Set(picked.flatMap((item) => item.evidence_metric_keys)),
  ];
  return {
    meta: {
      mode: "rules",
      fallback_reason: "key_missing",
      attempts: 0,
      snapshot_id: snapshotId(snapshot),
      generated_at: new Date().toISOString(),
    },
    summary:
      "程序已按当前筛选范围核对指标。以下事实与经营假设分开展示，建议效果仍需验证。",
    recommendations: picked,
    missing_data: [
      ...snapshot.totals.missing_fields,
      "固定成本",
      "税费",
      "售后原因明细",
    ],
    evidence: Object.fromEntries(usedKeys.map((key) => [key, registry[key]!])),
    scope: snapshot.scope,
    synthetic,
    knowledge_ids: [
      ...new Set(picked.flatMap((item) => item.knowledge_ids)),
    ].filter((id) => KNOWLEDGE_CARDS.some((card) => card.knowledge_id === id)),
  };
}
export function offlineDiagnosis(input: DiagnosisRequest): Diagnosis {
  const snapshot = computeMetrics(input.rows, input.filters);
  if (!snapshot.totals.line_count)
    throw new Error("当前筛选范围没有有效交易，请调整后再诊断。");
  return rulesFromSnapshot(snapshot, input.synthetic);
}
