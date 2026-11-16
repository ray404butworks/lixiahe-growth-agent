import type { MarketingDraft } from "../agent/content";
import { snapshotId } from "../agent/evidence";
import type { Diagnosis } from "../agent/rules";
import { escapeCSVField } from "../download";
import { KNOWLEDGE_CARDS } from "../knowledge/cards";
import { FIELDS } from "./contract";
import type { QualityReport } from "./import";
import type { Group, MetricSnapshot, Totals } from "./metrics";
import { money, totalUnits } from "./money";

type Cell = string | number | null;
type Table = { headers: string[]; rows: Cell[][] };
type Section = { title: string; paragraphs?: string[]; table?: Table };
export type ReportSource = {
  snapshot: MetricSnapshot;
  synthetic: boolean;
  quality: QualityReport;
  channel?: string;
  diagnosis: Diagnosis | null;
  draft: MarketingDraft | null;
  edited: boolean;
};

/** 格式化有值的金额，为缺失金额显示数据状态。 */
const amount = (value: string | null) =>
  value === null ? "数据不足" : `¥${money(value)}`;
/** 将贡献率的小数值转换为两位小数的百分比。 */
const percent = (value: string | null) =>
  value === null ? "数据不足" : `${(Number(value) * 100).toFixed(2)}%`;
/** 将生成模式转换成报告中的中文名称。 */
const mode = (value: "model" | "rules") =>
  value === "model" ? "模型生成" : "离线规则";
/** 为报告里空缺的表格单元格提供统一的状态文字。 */
const display = (cell: Cell) => cell ?? "数据不足";
const columns = [
  "有效订单行",
  "订单数",
  "销量",
  "成交额（元）",
  "已知退款（元）",
  "扣退款销售额（元）",
  "贡献毛益（元）",
  "贡献率",
];
/** 按报告固定表头排列总体指标。 */
const totalsRow = (totals: Totals): Cell[] => [
  totals.line_count,
  totals.order_count,
  totals.quantity,
  totals.gross_sales,
  totals.known_refunds,
  totals.net_sales,
  totals.contribution,
  totals.contribution_rate === null ? null : percent(totals.contribution_rate),
];
/** 使用定点金额比较分组成交额，避免浮点排序误差。 */
const ranked = (groups: Group[]) =>
  [...groups].sort((left, right) => {
    const l = totalUnits(left.gross_sales);
    const r = totalUnits(right.gross_sales);
    return l < r ? 1 : l > r ? -1 : 0;
  });
/** 生成按成交额排序的渠道或商品摘要表。 */
function summaryTable(groups: Group[], title: string): Table {
  return {
    headers: [title, "扣退款销售额", "贡献毛益", "贡献率"],
    rows: ranked(groups)
      .slice(0, 12)
      .map((group) => [
        group.name,
        amount(group.net_sales),
        amount(group.contribution),
        percent(group.contribution_rate),
      ]),
  };
}

/** 核对诊断、草稿和快照归属后，整理统一的报告内容。 */
export function buildReport(source: ReportSource) {
  const { snapshot, quality, synthetic, channel, edited } = source;
  const { totals, scope, comparison } = snapshot;
  const id = snapshotId(snapshot);
  const diagnosis =
    source.diagnosis?.meta.snapshot_id === id &&
    source.diagnosis.synthetic === synthetic
      ? source.diagnosis
      : null;
  const draft =
    diagnosis &&
    source.draft?.meta.snapshot_id === id &&
    diagnosis.recommendations.some(
      (item) => item.id === source.draft?.recommendation_id,
    )
      ? source.draft
      : null;
  const period = `${scope.start ?? "—"} 至 ${scope.end ?? "—"}`;
  const sourceLabel = synthetic ? "合成样例 · 仅用于演示" : "本地导入数据";
  const sections: Section[] = [
    {
      title: "数据范围与质量",
      paragraphs: [
        `${sourceLabel}｜有效订单日期 ${period}｜渠道 ${channel || "全部"}｜快照 ${id}`,
        `导入 ${quality.input_rows} 行，校验通过 ${quality.valid_rows} 行，拒绝 ${quality.rejected_rows} 行。当前范围选中 ${scope.selected_rows} 行，排除取消 ${scope.cancelled} 行，有效 ${totals.line_count} 行。`,
        `当前范围缺失订单编号 ${snapshot.quality.missing_id_rows} 行，重复订单编号 ${snapshot.quality.duplicate_order_ids.length} 个（仅提示，金额未去重）。`,
        `缺失的经营字段：${totals.missing_fields.map((key) => FIELDS.find((field) => field.key === key)?.label ?? key).join("、") || "无"}。`,
      ],
    },
    {
      title: "核心指标",
      table: {
        headers: ["指标", "本期结果"],
        rows: [
          ["成交额", amount(totals.gross_sales)],
          ["已知退款", amount(totals.known_refunds)],
          ["扣退款销售额", amount(totals.net_sales)],
          ["订单数", totals.order_count],
          ["销量", totals.quantity],
          ["贡献毛益", amount(totals.contribution)],
          ["贡献率", percent(totals.contribution_rate)],
          [
            "最近七日变化",
            comparison.status === "new"
              ? "前七日销售为零，本期新增"
              : comparison.status === "comparable"
                ? percent(comparison.value)
                : "数据不足",
          ],
        ],
      },
      paragraphs: ["退款按订单日期归属。贡献毛益 = 扣退款销售额 − 可变成本。"],
    },
    {
      title: "渠道表现",
      paragraphs: ["按成交额排序，最多展示前 12 项。"],
      table: summaryTable(snapshot.channels, "渠道"),
    },
    {
      title: "商品表现",
      paragraphs: ["按成交额排序，最多展示前 12 项。"],
      table: summaryTable(snapshot.skus, "商品"),
    },
    {
      title: "经营诊断",
      paragraphs: diagnosis
        ? [`生成方式：${mode(diagnosis.meta.mode)}。`]
        : ["当前筛选范围尚无诊断。可先导出数据摘要，或完成诊断后再导出。"],
    },
  ];
  if (diagnosis) {
    sections.push(
      ...diagnosis.recommendations.map(
        (item): Section => ({
          title: `${item.priority} · ${item.title}`,
          paragraphs: [
            `数据观察：${item.observation}`,
            `证据键：${item.evidence_metric_keys.join("、")}`,
            `待验证假设：${item.hypothesis}`,
            `下一步：${item.action}`,
            ...(item.knowledge_ids.length
              ? [`知识来源：${item.knowledge_ids.join("、")}`]
              : []),
          ],
        }),
      ),
    );
  }
  if (draft) {
    sections.push(
      {
        title: "七日行动清单",
        table: {
          headers: ["日期", "行动", "证据键"],
          rows: draft.plan.map((day) => [
            `第 ${day.day} 日`,
            day.action,
            day.evidence_metric_keys.join("、"),
          ]),
        },
      },
      {
        title: "营销草稿 · 发布前复核",
        paragraphs: [
          `生成方式：${mode(draft.meta.mode)}${edited ? "，已人工编辑，仍待复核" : ""}。`,
          `短视频标题：${draft.text.video_title}`,
          ...draft.text.video_segments.map(
            (segment, index) =>
              `分镜 ${index + 1}\n画面：${segment.visual}\n口播：${segment.narration}`,
          ),
          `商品文案\n${draft.text.product_copy}`,
          `社交文案\n${draft.text.social_copy}`,
        ],
      },
    );
  } else {
    sections.push({
      title: "七日行动与营销草稿",
      paragraphs: [
        "当前筛选范围尚无草稿。生成营销草稿后，此处会自动带入行动清单和最新编辑内容。",
      ],
    });
  }
  const keys = [
    ...(diagnosis?.knowledge_ids ?? []),
    ...(draft?.knowledge_ids ?? []),
  ];
  if (keys.length) {
    sections.push({
      title: "本土知识来源",
      paragraphs: KNOWLEDGE_CARDS.filter((card) =>
        keys.includes(card.knowledge_id),
      ).map(
        (card) =>
          `${card.knowledge_id} · ${card.title}｜${card.source_org}｜核验 ${card.last_verified_at}\n${card.source_url}`,
      ),
    });
  }
  return {
    title: "里下河 · 经营复盘报告",
    subtitle: `${sourceLabel}｜${period}`,
    filename: `里下河-经营报告-${scope.end ?? "未定"}`,
    sections,
    csv: {
      headers: ["分组", "名称", ...columns],
      rows: [
        ["合计", "当前范围", ...totalsRow(totals)],
        ...snapshot.channels.map((group) => [
          "渠道",
          group.name,
          ...totalsRow(group),
        ]),
        ...snapshot.skus.map((group) => [
          "商品",
          group.name,
          ...totalsRow(group),
        ]),
        ...snapshot.daily.map((group) => [
          "日期",
          group.name,
          ...totalsRow(group),
        ]),
      ],
    } satisfies Table,
  };
}

export type GrowthReport = ReturnType<typeof buildReport>;
/** 对插入 HTML 报告的文本进行实体转义。 */
const html = (value: Cell) =>
  String(display(value)).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
/** 转义 Markdown 表格单元格中的控制符号。 */
const markdown = (value: Cell) =>
  html(value)
    .replace(/[\\`*_{}\[\]()#+!|~]/g, "\\$&")
    .replace(/\r?\n/g, "  \n");

/** 将统一报告模型导出为 Markdown。 */
export function reportMarkdown(report: GrowthReport): string {
  return (
    [
      `# ${report.title}`,
      report.subtitle,
      ...report.sections.map((section) => {
        const { table, paragraphs = [] } = section;
        /** 生成一行 Markdown 表格。 */
        const row = (cells: Cell[]) =>
          `| ${cells.map((cell) => markdown(cell).replace(/\s*\n/g, " ")).join(" | ")} |`;
        return [
          `## ${markdown(section.title)}`,
          ...paragraphs.map(markdown),
          ...(table
            ? [
                [
                  row(table.headers),
                  row(table.headers.map(() => "---")),
                  ...table.rows.map(row),
                ].join("\n"),
              ]
            : []),
        ].join("\n\n");
      }),
    ].join("\n\n") + "\n"
  );
}

/** 将统一报告模型导出为可浏览和打印的 HTML。 */
export function reportHtml(report: GrowthReport): string {
  /** 生成一组经过转义的 HTML 表格单元格。 */
  const cells = (row: Cell[], tag: "th" | "td") =>
    row.map((cell) => `<${tag}>${html(cell)}</${tag}>`).join("");
  const sections = report.sections
    .map(
      ({ title, paragraphs = [], table }) =>
        `<section><h2>${html(title)}</h2>${paragraphs.map((text) => `<p>${html(text)}</p>`).join("")}${
          table
            ? `<table><thead><tr>${cells(table.headers, "th")}</tr></thead><tbody>${table.rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody></table>`
            : ""
        }</section>`,
    )
    .join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(report.title)}</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#19372b;margin:24px auto;padding:0 16px;max-width:880px}section{margin:24px 0}h2{border-bottom:1px solid #dbe3d8;font-size:1.15rem}p{white-space:pre-line;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{padding:6px;border-bottom:1px solid #dbe3d8;text-align:left;overflow-wrap:anywhere}@media print{body{margin:0;color:#111}h2{break-after:avoid}tr{break-inside:avoid}}</style><main><h1>${html(report.title)}</h1><p>${html(report.subtitle)}</p>${sections}</main></html>`;
}

/** 将报告表格展平为 CSV，保留各段标题和表头。 */
export function reportCsv(report: GrowthReport): string {
  /** 转义 CSV 单元格，并保护可能被表格应用解析为公式的文本。 */
  const cell = (value: Cell, index: number) => {
    const raw = String(value ?? "");
    // First two columns can contain spreadsheet formulas from imported data.
    const safe =
      index < 2 && /^[\s\uFEFF]*[=+@\-\t\r\n]/.test(raw) ? `'${raw}` : raw;
    return escapeCSVField(safe);
  };
  return (
    "\uFEFF" +
    [report.csv.headers, ...report.csv.rows]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
