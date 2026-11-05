"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Copy,
  FileText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { KNOWLEDGE_CARDS, type KnowledgeCard } from "~/lib/knowledge/cards";
import { requestDiagnosis, requestMarketing } from "~/lib/agent/client";
import type { Diagnosis } from "~/lib/agent/rules";
import {
  AI_DRAFT_LABEL,
  factViolations,
  type MarketingDraft,
} from "~/lib/agent/content";
import { snapshotId } from "~/lib/agent/evidence";
import type {
  DiagnosisRequest,
  FallbackReason,
  ProductFacts,
} from "~/lib/agent/schema";
import type { MetricSnapshot } from "~/lib/growth/metrics";
import { FIELDS } from "~/lib/growth/contract";
type AgentView = "diagnose" | "content" | "knowledge";
type Props = {
  view: AgentView | null;
  input: DiagnosisRequest | null;
  snapshot: MetricSnapshot | null;
  onNavigate: (view: AgentView | "import") => void;
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
export function AgentWorkbench({ view, input, snapshot, onNavigate }: Props) {
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
  }, [fingerprint]);
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
  if (view === "knowledge")
    return (
      <section className="knowledge-page">
        <div className="section-title">
          <div>
            <h2>本土知识，有出处才能用</h2>
            <p>六张公开来源卡片 · 核验日期2026-11-05</p>
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
        <div className="info-banner">
          <ShieldCheck size={17} />
          已核验的是公开页面的事实摘要；不代表本系统已审核商家认证、授权或实际履约能力。
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
  if (!eligible)
    return (
      <section className="panel empty-state">
        <Sparkles size={38} />
        <h2>诊断需要有效的经营数据</h2>
        <p>请先导入数据，或调整看板筛选范围。</p>
        <button className="button primary" onClick={() => onNavigate("import")}>
          去导入数据
          <ArrowRight size={16} />
        </button>
      </section>
    );
  return (
    <div className="agent-page">
      <div className="agent-status-bar">
        <span
          className={`tag ${diagnosis?.meta.mode === "model" ? "green" : "amber"}`}
        >
          {diagnosis?.meta.mode === "model" ? "模型模式" : "离线规则模式"}
        </span>
        <span>
          {modelReady
            ? "服务端模型已配置；是否调用由本次授权决定。"
            : "服务端API Key暂留空，规则链路可完整体验。"}
        </span>
        <small>
          {snapshot?.scope.start} — {snapshot?.scope.end} ·{" "}
          {input?.synthetic ? "合成交易" : "本地导入数据"}
        </small>
      </div>
      <div className="privacy-note">
        <ShieldCheck size={16} />
        诊断在本地服务重新计算指标。启用模型时仅发送汇总指标、建议上下文和来源摘要，不发送订单ID或原始文件。
      </div>
      <label className="model-consent">
        <input
          type="checkbox"
          checked={allowModel}
          disabled={!modelReady || busy}
          onChange={(event) => setAllowModel(event.target.checked)}
        />
        本次允许已配置模型处理汇总指标（默认关闭）
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
            <div>
              <p className="eyebrow">EVIDENCE BEFORE ADVICE</p>
              <h2>先说看到了什么，再说可以怎么做。</h2>
              <p>每条建议都附指标依据，可能原因与实际结果分开。</p>
            </div>
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
              <p className="agent-summary">{diagnosis.summary}</p>
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
                      <div>
                        <dt>预期与边界</dt>
                        <dd>
                          {item.expected_effect}
                          <br />
                          {item.risk_note}
                        </dd>
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
                <p className="fineprint">
                  这些缺口会限制经营判断；规则建议不代表已经完成原因归因。
                </p>
              </div>
            </>
          )}
        </>
      ) : !diagnosis ? (
        <section className="panel empty-state">
          <FileText size={38} />
          <h2>先选择一条有依据的建议</h2>
          <p>完成经营诊断后，再确认商品事实并生成内容。</p>
          <button
            className="button primary"
            onClick={() => onNavigate("diagnose")}
          >
            去经营诊断
            <ArrowRight size={16} />
          </button>
        </section>
      ) : (
        <>
          <section className="panel facts-panel">
            <div className="section-title">
              <div>
                <h2>先核对商品事实</h2>
                <p>没有勾选确认的内容只会保留“待核对”占位。</p>
              </div>
              <span className="tag amber">人工确认</span>
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
            <p className="fineprint">
              本阶段不审核认证材料。受保护名称、认证、功效和极限宣传断言不能因勾选而自动通过。
            </p>
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
                  <h2>营销草稿，交给你最后把关</h2>
                  <p>{AI_DRAFT_LABEL}</p>
                </div>
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
                    <h3>{key === "product_copy" ? "商品文案" : "社交文案"}</h3>
                    <label>
                      {key === "product_copy" ? "编辑商品文案" : "编辑社交文案"}
                      <textarea
                        rows={8}
                        value={draft.text[key]}
                        onChange={(event) => editText(key, event.target.value)}
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
                            .map((key) => diagnosis.evidence[key]?.label ?? key)
                            .join("；")}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="panel">
                <h2>发布前核对</h2>
                {draft.warnings.map((warning) => (
                  <p className="review-line" key={warning}>
                    <CheckCircle2 size={14} />
                    {warning}
                  </p>
                ))}
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
      <div className="knowledge-constraint">
        {card.claim_constraints.join(" ")}
      </div>
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
