"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Copy,
  FileText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { KNOWLEDGE_CARDS, type KnowledgeCard } from "~/lib/knowledge/cards";
import { requestDiagnosis, requestMarketing } from "~/lib/agent/client";
import type { Diagnosis } from "~/lib/agent/rules";
import { factViolations, type MarketingDraft } from "~/lib/agent/content";
import { snapshotId } from "~/lib/agent/evidence";
import type {
  DiagnosisRequest,
  FallbackReason,
  ProductFacts,
} from "~/lib/agent/schema";
import type { MetricSnapshot } from "~/lib/growth/metrics";
import type { QualityReport } from "~/lib/growth/import";
import { FIELDS } from "~/lib/growth/contract";
import { GrowthReportView } from "./growth-report";
import { WorkspaceEmptyState } from "./workspace-empty-state";
type AgentView = "diagnose" | "content" | "knowledge" | "report";
type Props = {
  view: AgentView | null;
  input: DiagnosisRequest | null;
  snapshot: MetricSnapshot | null;
  quality?: QualityReport;
  onNavigate: (view: AgentView | "import") => void;
  onAdjustFilters: () => void;
  onUseSample: () => void;
};
const reasons: Record<FallbackReason, string> = {
  key_missing: "服务端API Key留空，当前使用离线规则。",
  model_disabled: "模型开关未开启，当前使用离线规则。",
  model_config_incomplete: "模型配置不完整，已回退到规则。",
  model_timeout: "模型响应超时，已回退到规则。",
  model_failed: "模型服务暂不可用，已回退到规则。",
  invalid_output: "模型输出未通过证据或事实校验，已回退到规则。",
  budget_exceeded: "本地每日模型调用次数已达上限，已回退到规则。",
  offline: "当前未连接本地API服务，使用浏览器离线规则。",
  not_authorized: "本次未允许外部模型处理，当前使用离线规则。",
};
const emptyFacts = (): ProductFacts => ({
  sku: "",
  name: "",
  name_confirmed: false,
  specification: { value: "", confirmed: false },
  origin: { value: "", confirmed: false },
  selling_point: { value: "", confirmed: false },
  shipping: { value: "", confirmed: false },
});
const factNames = {
  specification: "商品规格",
  origin: "产地信息",
  selling_point: "商品特点",
  shipping: "配送说明",
};
export function marketingPlainText(draft: MarketingDraft): string {
  return [
    draft.label,
    `生成模式：${draft.meta.mode === "model" ? "模型生成" : "离线规则"}`,
    draft.text.video_title,
    ...draft.text.video_segments.map(
      (segment, index) =>
        `${["开场", "商品细节", "咨询引导"][index]}\n画面：${segment.visual}\n口播：${segment.narration}`,
    ),
    "商品文案",
    draft.text.product_copy,
    "社交文案",
    draft.text.social_copy,
    "七日行动清单",
    ...draft.plan.map((day) => `第${day.day}日：${day.action}`),
    "发布前核对",
    ...draft.warnings,
    "知识来源",
    ...KNOWLEDGE_CARDS.filter((card) =>
      draft.knowledge_ids.includes(card.knowledge_id),
    ).map((card) => `${card.knowledge_id} ${card.title}｜${card.source_url}`),
  ].join("\n\n");
}
export function AgentWorkbench({
  view,
  input,
  snapshot,
  quality,
  onNavigate,
  onAdjustFilters,
  onUseSample,
}: Props) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [draft, setDraft] = useState<MarketingDraft | null>(null);
  const [selected, setSelected] = useState("");
  const [facts, setFacts] = useState<ProductFacts>(emptyFacts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [allowModel, setAllowModel] = useState(false);
  const [edited, setEdited] = useState(false);
  const [tag, setTag] = useState("全部");
  const [modelReady, setModelReady] = useState(false);
  const serial = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const fingerprint = useMemo(
    () => (snapshot ? snapshotId(snapshot) : "none"),
    [snapshot],
  );
  useEffect(() => {
    serial.current++;
    controller.current?.abort();
    setDiagnosis(null);
    setDraft(null);
    setSelected("");
    updateFacts(emptyFacts());
    setError("");
    setStatus("");
    setBusy(false);
    setEdited(false);
  }, [fingerprint, input]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/health", { signal: abort.signal })
      .then((response) => response.json())
      .then((value: { model_configured?: boolean }) =>
        setModelReady(value.model_configured === true),
      )
      .catch(() => setModelReady(false));
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, []);
  const eligible = !!input && !!snapshot?.totals.line_count;
  const violations = useMemo(() => factViolations(facts), [facts]);
  function chooseProduct(sku: string) {
    const product = snapshot?.skus.find((item) => item.key === sku);
    const name = product?.name.replace(/（.*?）/g, "").trim() ?? "";
    const specification =
      name.match(/\d+(?:\.\d+)?\s?(?:kg|g|斤|克|公斤|袋|盒)/i)?.[0] ?? "";
    updateFacts({
      ...emptyFacts(),
      sku,
      name,
      specification: { value: specification, confirmed: false },
    });
    setDraft(null);
    setEdited(false);
    setStatus("");
  }
  function invalidateDraft() {
    serial.current++;
    controller.current?.abort();
    setDraft(null);
    setBusy(false);
    setError("");
    setStatus("");
    setEdited(false);
  }
  function updateFacts(next: ProductFacts) {
    setFacts(next);
    invalidateDraft();
  }
  function chooseRecommendation(id: string) {
    setSelected(id);
    invalidateDraft();
  }
  async function runDiagnosis() {
    if (!input || !eligible) return;
    const token = ++serial.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setDraft(null);
    setStatus("");
    try {
      const result = await requestDiagnosis(
        { ...input, allow_model: allowModel },
        abort.signal,
      );
      if (token !== serial.current) return;
      setDiagnosis(result);
      setSelected(result.recommendations[0]?.id ?? "");
    } catch (err) {
      if (token === serial.current)
        setError(err instanceof Error ? err.message : "诊断失败，请重试。");
    } finally {
      if (token === serial.current) setBusy(false);
    }
  }
  async function generate() {
    if (!input || !diagnosis || !selected || !facts.sku || violations.length)
      return;
    const token = ++serial.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setStatus("");
    setDraft(null);
    try {
      const result = await requestMarketing(
        {
          ...input,
          allow_model: allowModel,
          facts,
          recommendation_id: selected,
        },
        abort.signal,
      );
      if (token !== serial.current) return;
      setDraft(result);
      setEdited(false);
    } catch (err) {
      if (token === serial.current)
        setError(
          err instanceof Error ? err.message : "生成失败，请检查商品事实。",
        );
    } finally {
      if (token === serial.current) setBusy(false);
    }
  }
  function editText(
    key: "video_title" | "product_copy" | "social_copy",
    value: string,
  ) {
    if (draft) {
      setDraft({ ...draft, text: { ...draft.text, [key]: value } });
      setEdited(true);
      setStatus("");
    }
  }
  function editSegment(
    index: number,
    key: "visual" | "narration",
    value: string,
  ) {
    if (!draft) return;
    const video_segments = draft.text.video_segments.map((segment, i) =>
      i === index ? { ...segment, [key]: value } : segment,
    );
    setDraft({ ...draft, text: { ...draft.text, video_segments } });
    setEdited(true);
    setStatus("");
  }
  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(marketingPlainText(draft));
      setStatus("已复制草稿、七日清单、来源与待核对标记。");
    } catch {
      setStatus(
        "浏览器未允许复制，请在文本框中手动复制；发布时请保留草稿标记。",
      );
    }
  }
  if (view === null) return null;
  const dataEmptyState = input ? (
    <WorkspaceEmptyState
      title={snapshot ? "当前范围没有有效交易" : "统计范围有误"}
      primary={{ label: "调整统计范围", onClick: onAdjustFilters }}
    />
  ) : (
    <WorkspaceEmptyState
      title="还没有销售数据"
      primary={{ label: "导入销售数据", onClick: () => onNavigate("import") }}
      secondary={{ label: "使用演示样例", onClick: onUseSample }}
    />
  );
  if (view === "report" && !eligible) return dataEmptyState;
  if (view === "report")
    return (
      <GrowthReportView
        source={
          snapshot && input && quality
            ? {
                snapshot,
                quality,
                synthetic: input.synthetic,
                channel: input.filters.channel,
                diagnosis,
                draft,
                edited,
              }
            : null
        }
        onImport={() => onNavigate("import")}
        onDiagnose={() => onNavigate("diagnose")}
      />
    );
  if (view === "knowledge")
    return (
      <section className="knowledge-page">
        <div className="section-title">
          <div>
            <p>核验日期：2026-11-05</p>
          </div>
          <label className="knowledge-filter">
            品类
            <select
              value={tag}
              onChange={(event) => setTag(event.target.value)}
            >
              {["全部", "大米", "河蟹", "蔬菜"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="knowledge-grid">
          {KNOWLEDGE_CARDS.filter(
            (card) =>
              tag === "全部" ||
              card.product_tags.includes(tag) ||
              card.product_tags.includes("通用"),
          ).map((card) => (
            <KnowledgeCardView card={card} key={card.knowledge_id} />
          ))}
        </div>
      </section>
    );
  if (!eligible) return dataEmptyState;
  if (view === "content" && !diagnosis)
    return (
      <WorkspaceEmptyState
        title="先完成经营诊断"
        primary={{
          label: "进入经营诊断",
          onClick: () => onNavigate("diagnose"),
        }}
      />
    );
  return (
    <div className="agent-page">
      <div className="agent-status-bar">
        <span
          className={`tag ${diagnosis?.meta.mode === "model" ? "green" : "amber"}`}
        >
          {diagnosis?.meta.mode === "model" ? "模型模式" : "离线规则模式"}
        </span>
        <span>{modelReady ? "模型已配置" : "模型未配置"}</span>
        <small>
          {snapshot?.scope.start} — {snapshot?.scope.end} ·{" "}
          {input?.synthetic ? "合成交易" : "本地导入数据"}
        </small>
      </div>
      <div className="privacy-note">
        <ShieldCheck size={16} />
        本地服务计算经营指标。模型接收汇总指标、建议上下文和来源摘要。
      </div>
      <label className="model-consent">
        <input
          type="checkbox"
          checked={allowModel}
          disabled={!modelReady || busy}
          onChange={(event) => setAllowModel(event.target.checked)}
        />
        本次允许模型处理汇总指标
      </label>
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      {status && (
        <div role="status" className="info-banner">
          {status}
        </div>
      )}
      {view === "diagnose" ? (
        <>
          <section className="panel diagnosis-intro">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void runDiagnosis()}
            >
              {diagnosis ? <RefreshCw size={16} /> : <Sparkles size={16} />}{" "}
              {busy ? "正在核对指标…" : diagnosis ? "重新诊断" : "一键经营诊断"}
            </button>
          </section>
          {diagnosis && (
            <>
              <div className="info-banner">
                {diagnosis.meta.fallback_reason
                  ? reasons[diagnosis.meta.fallback_reason]
                  : "模型建议已通过结构、指标引用和断言校验。"}
                <small>
                  快照 {diagnosis.meta.snapshot_id} · 模型尝试{" "}
                  {diagnosis.meta.attempts} 次
                </small>
              </div>
              <div className="recommendations">
                {diagnosis.recommendations.map((item) => (
                  <article className="panel recommendation" key={item.id}>
                    <div className="section-title">
                      <h2>
                        <span
                          className={`priority ${item.priority.toLowerCase()}`}
                        >
                          {item.priority}
                        </span>
                        {item.title}
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => {
                          chooseRecommendation(item.id);
                          setDraft(null);
                          setError("");
                          onNavigate("content");
                        }}
                      >
                        生成营销方案
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="evidence-strip">
                      <span>数据观察</span>
                      {item.evidence_metric_keys.map((key) => {
                        const evidence = diagnosis.evidence[key];
                        return evidence ? (
                          <div key={key}>
                            <small>{evidence.label}</small>
                            <b>{evidence.display}</b>
                            <code>{key}</code>
                          </div>
                        ) : null;
                      })}
                    </div>
                    <dl>
                      <div>
                        <dt>可能原因 · 待验证</dt>
                        <dd>{item.hypothesis}</dd>
                      </div>
                      <div>
                        <dt>下一步动作</dt>
                        <dd>{item.action}</dd>
                      </div>
                    </dl>
                    <div className="source-links">
                      <BookOpen size={13} />
                      {item.knowledge_ids.map((id) => (
                        <button
                          className="text-button"
                          key={id}
                          onClick={() => onNavigate("knowledge")}
                        >
                          {id}{" "}
                          {
                            KNOWLEDGE_CARDS.find(
                              (card) => card.knowledge_id === id,
                            )?.title
                          }
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <div className="panel">
                <h2>仍缺少的数据</h2>
                <div className="missing-fields">
                  {diagnosis.missing_data.map((field) => (
                    <span key={field}>
                      {FIELDS.find((item) => item.key === field)?.label ??
                        field}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        diagnosis && (
          <>
            <section className="panel facts-panel">
              <div className="section-title">
                <div>
                  <h2>核对商品事实</h2>
                  <p>勾选已核对的商品信息。</p>
                </div>
              </div>
              <div className="facts-top">
                <label>
                  依据建议
                  <select
                    value={selected}
                    onChange={(event) => {
                      chooseRecommendation(event.target.value);
                      setDraft(null);
                    }}
                  >
                    {diagnosis.recommendations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  选择商品
                  <select
                    value={facts.sku}
                    onChange={(event) => chooseProduct(event.target.value)}
                  >
                    <option value="">请选择SKU</option>
                    {snapshot?.skus.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="fact-field">
                <label>
                  商品名称
                  <input
                    maxLength={80}
                    value={facts.name}
                    onChange={(event) => {
                      updateFacts({
                        ...facts,
                        name: event.target.value,
                        name_confirmed: false,
                      });
                      setDraft(null);
                    }}
                  />
                </label>
                <label className="fact-check">
                  <input
                    type="checkbox"
                    checked={facts.name_confirmed}
                    onChange={(event) => {
                      updateFacts({
                        ...facts,
                        name_confirmed: event.target.checked,
                      });
                      setDraft(null);
                    }}
                  />
                  我已核对商品名称
                </label>
              </div>
              <div className="facts-grid">
                {(Object.keys(factNames) as (keyof typeof factNames)[]).map(
                  (key) => (
                    <div className="fact-field" key={key}>
                      <label>
                        {factNames[key]}
                        <input
                          maxLength={160}
                          value={facts[key].value}
                          placeholder="留空则生成待核对占位"
                          onChange={(event) => {
                            updateFacts({
                              ...facts,
                              [key]: {
                                value: event.target.value,
                                confirmed: false,
                              },
                            });
                            setDraft(null);
                          }}
                        />
                      </label>
                      <label className="fact-check">
                        <input
                          type="checkbox"
                          checked={facts[key].confirmed}
                          onChange={(event) => {
                            updateFacts({
                              ...facts,
                              [key]: {
                                ...facts[key],
                                confirmed: event.target.checked,
                              },
                            });
                            setDraft(null);
                          }}
                        />
                        我已核对{factNames[key]}
                      </label>
                    </div>
                  ),
                )}
              </div>

              {!!violations.length && (
                <div role="alert" className="warning-banner">
                  请修改含认证、功效、受保护名称或指令内容的字段：
                  {violations
                    .map((key) =>
                      key === "name"
                        ? "商品名称"
                        : factNames[key as keyof typeof factNames],
                    )
                    .join("、")}
                </div>
              )}
              <div className="confirm-row">
                <p>将生成短视频脚本、商品文案、社交文案与七日行动清单。</p>
                <button
                  className="button primary"
                  disabled={
                    !facts.sku || !facts.name || busy || !!violations.length
                  }
                  onClick={() => void generate()}
                >
                  <Sparkles size={16} />
                  {busy ? "正在生成草稿…" : "生成营销草稿"}
                </button>
              </div>
            </section>
            {draft && (
              <section className="draft-output">
                <div className="section-title">
                  <div>
                    <h2>营销草稿</h2>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => onNavigate("report")}
                  >
                    <FileText size={16} />
                    查看经营报告
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => void copy()}
                  >
                    <Copy size={16} />
                    复制全部草稿
                  </button>
                </div>
                <div className="info-banner">
                  {draft.meta.mode === "model"
                    ? "模型草稿已通过结构与事实占位符检查。"
                    : reasons[draft.meta.fallback_reason ?? "key_missing"]}
                  {edited && (
                    <span className="tag amber">已人工编辑 · 仍待复核</span>
                  )}
                </div>
                <div className="missing-fields">
                  {draft.missing_facts.map((key) => (
                    <span key={key}>
                      待核对：
                      {key === "name"
                        ? "商品名称"
                        : factNames[key as keyof typeof factNames]}
                    </span>
                  ))}
                </div>
                <article className="panel draft-card">
                  <h3>短视频脚本 · 建议约30秒</h3>
                  <label>
                    视频标题
                    <input
                      value={draft.text.video_title}
                      onChange={(event) =>
                        editText("video_title", event.target.value)
                      }
                    />
                  </label>
                  {draft.text.video_segments.map((segment, index) => (
                    <div className="script-segment" key={index}>
                      <span>
                        {
                          [
                            "0—8秒 · 开场",
                            "8—22秒 · 商品细节",
                            "22—30秒 · 咨询引导",
                          ][index]
                        }
                      </span>
                      <label>
                        画面{index + 1}
                        <textarea
                          value={segment.visual}
                          onChange={(event) =>
                            editSegment(index, "visual", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        口播{index + 1}
                        <textarea
                          value={segment.narration}
                          onChange={(event) =>
                            editSegment(index, "narration", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  ))}
                </article>
                <div className="copy-grid">
                  {(["product_copy", "social_copy"] as const).map((key) => (
                    <article className="panel draft-card" key={key}>
                      <h3>
                        {key === "product_copy" ? "商品文案" : "社交文案"}
                      </h3>
                      <label>
                        {key === "product_copy"
                          ? "编辑商品文案"
                          : "编辑社交文案"}
                        <textarea
                          rows={8}
                          value={draft.text[key]}
                          onChange={(event) =>
                            editText(key, event.target.value)
                          }
                        />
                      </label>
                    </article>
                  ))}
                </div>
                <section className="panel">
                  <div className="section-title">
                    <h2>七日行动清单</h2>
                    <span className="tag green">从建议走向复盘</span>
                  </div>
                  <ol className="action-week">
                    {draft.plan.map((day) => (
                      <li key={day.day}>
                        <b>DAY {String(day.day).padStart(2, "0")}</b>
                        <span>
                          {day.action}
                          <small>
                            依据：
                            {day.evidence_metric_keys
                              .map(
                                (key) => diagnosis.evidence[key]?.label ?? key,
                              )
                              .join("；")}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
                <section className="panel">
                  <div className="source-links">
                    <BookOpen size={14} />
                    {draft.knowledge_ids.map((id) => (
                      <button
                        className="text-button"
                        key={id}
                        onClick={() => onNavigate("knowledge")}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </section>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}
function KnowledgeCardView({ card }: { card: KnowledgeCard }) {
  return (
    <article className="panel knowledge-card">
      <div className="section-title">
        <span className="knowledge-id">{card.knowledge_id}</span>
        <span className="tag green">来源已核验</span>
      </div>
      <h2>{card.title}</h2>
      <p>{card.summary}</p>
      <dl>
        <div>
          <dt>发布机构</dt>
          <dd>{card.source_org}</dd>
        </div>
        <div>
          <dt>发布日期</dt>
          <dd>{card.published_at}</dd>
        </div>
        <div>
          <dt>核验日期</dt>
          <dd>{card.last_verified_at}</dd>
        </div>
      </dl>
      <a
        className="text-button"
        href={card.source_url}
        target="_blank"
        rel="noreferrer"
      >
        查看原始来源
        <ArrowRight size={13} />
      </a>
    </article>
  );
}
