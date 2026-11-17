"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  Menu,
  ClipboardList,
  NotebookPen,
  BookOpen,
  ScanLine,
  Settings2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  autoMap,
  FIELDS,
  type Mapping,
  type OrderRow,
} from "~/lib/growth/contract";
import {
  generateDemo,
  rowsToCSV,
  SCENARIOS,
  type Scenario,
} from "~/lib/growth/demo";
import {
  normalizeOrders,
  MAX_BYTES,
  MAX_ROWS,
  type ImportOptions,
  type QualityReport,
} from "~/lib/growth/import";
import { computeMetrics, type Group } from "~/lib/growth/metrics";
import { money, totalUnits } from "~/lib/growth/money";
import { validateWorkbookArchive } from "~/lib/growth/file";
import {
  parseCSVWithDiagnostics,
  decodeText,
  type CSVData,
} from "~/lib/csv-parser";
import {
  isSupportedFile,
  isXLSXFile,
  parseXLSX,
  SPREADSHEET_ACCEPT,
} from "~/lib/xlsx-parser";
import { listXLSXSheets } from "csv-charts-ai/tabular";
import { AgentWorkbench } from "./agent-workbench";
import { WorkspaceEmptyState } from "./workspace-empty-state";
import type { DiagnosisRequest } from "~/lib/agent/schema";

type View =
  | "import"
  | "dashboard"
  | "diagnose"
  | "content"
  | "knowledge"
  | "report";
const pages: Record<View, { label: string; title: string }> = {
  import: { label: "数据导入", title: "导入销售数据" },
  dashboard: { label: "经营看板", title: "经营看板" },
  diagnose: { label: "经营诊断", title: "经营诊断" },
  content: { label: "营销内容", title: "营销内容" },
  knowledge: { label: "本土知识", title: "本土知识" },
  report: { label: "经营报告", title: "经营报告" },
};
const workspaceNavigation = [
  { view: "import", icon: FileSpreadsheet },
  { view: "dashboard", icon: BarChart3 },
  { view: "diagnose", icon: ScanLine },
  { view: "content", icon: NotebookPen },
  { view: "report", icon: ClipboardList },
  { view: "knowledge", icon: BookOpen },
] as const;

/** 渲染共用导航，并标明当前工作台入口。 */
function WorkspaceNavigation({
  current,
  onNavigate,
}: {
  current: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <nav className="workspace-navigation" aria-label="工作台导航">
      {workspaceNavigation.map(({ view, icon: Icon }) => (
        <button
          key={view}
          type="button"
          aria-current={view === current ? "page" : undefined}
          className={view === current ? "active" : ""}
          onClick={() => onNavigate(view)}
        >
          <Icon size={17} aria-hidden="true" />
          {pages[view].label}
        </button>
      ))}
      <a className="workspace-settings-link" href="/legal/">
        <Settings2 size={17} aria-hidden="true" />
        数据设置
      </a>
    </nav>
  );
}

/** 显示共用垛田标志和工作台名称。 */
function WorkspaceBrand() {
  return (
    <a href="/" className="brand">
      <span className="brand-mark">
        <Image
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/duotian-mark.svg`}
          width={33}
          height={33}
          alt=""
        />
      </span>
      <span>
        里下河<small>农企增长 Agent</small>
      </span>
    </a>
  );
}

type Dataset = {
  rows: OrderRow[];
  quality: QualityReport;
  fileName: string;
  synthetic: boolean;
};
/** 查找字段的中文显示名，未知字段沿用原键名。 */
const label = (key: string) =>
  FIELDS.find((field) => field.key === key)?.label ?? key;
/** 构造并触发销售模板文件下载。 */
function download(
  text: string,
  filename: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** 压缩图表轴上的大数显示，便于比较量级。 */
function shortNumber(value: number) {
  return Math.abs(value) >= 10000
    ? `${(value / 10000).toFixed(1)}万`
    : String(Math.round(value));
}

/** 判断滚动区下方是否仍有未显示的导航入口。 */
function hasMoreMenuEntries(menu: HTMLElement) {
  return menu.scrollHeight - menu.clientHeight - menu.scrollTop > 1;
}

/** 组织文件导入、指标筛选和各页切换，统一持有会话内的经营数据。 */
export function GrowthWorkspace({
  initialView = "import",
}: {
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);
  const [raw, setRaw] = useState<CSVData | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [options, setOptions] = useState<ImportOptions>({
    assumePaid: false,
    assumeNoRefund: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [encoding, setEncoding] = useState("utf-8");
  const [delimiter, setDelimiter] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [acceptRejected, setAcceptRejected] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [channel, setChannel] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceMenuHasMore, setWorkspaceMenuHasMore] = useState(false);
  const [dashboardFiltersOpen, setDashboardFiltersOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const workspaceMenuScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const menu = workspaceMenuScroll.current;
    if (!workspaceMenuOpen || !menu) return;
    const observer = new ResizeObserver(() => {
      setWorkspaceMenuHasMore(hasMoreMenuEntries(menu));
    });
    observer.observe(menu);
    if (menu.firstElementChild) observer.observe(menu.firstElementChild);
    /** 菜单关闭或组件卸载时停止监听尺寸变化。 */
    return () => observer.disconnect();
  }, [view, workspaceMenuOpen]);
  const normalized = useMemo(() => {
    if (!raw) return null;
    try {
      return { result: normalizeOrders(raw, mapping, options), error: "" };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : "数据校验失败",
      };
    }
  }, [raw, mapping, options]);
  const computed = useMemo(() => {
    if (!dataset) return null;
    try {
      return {
        snapshot: computeMetrics(dataset.rows, {
          start: start || undefined,
          end: end || undefined,
          channel: channel || undefined,
        }),
        error: "",
      };
    } catch (err) {
      return {
        snapshot: null,
        error: err instanceof Error ? err.message : "筛选无效",
      };
    }
  }, [dataset, start, end, channel]);
  const snapshot = computed?.snapshot;
  const dashboardStart = start || snapshot?.scope.start;
  const dashboardEnd = end || snapshot?.scope.end;
  const agentInput = useMemo<DiagnosisRequest | null>(
    () =>
      dataset
        ? {
            rows: dataset.rows,
            filters: {
              start: start || undefined,
              end: end || undefined,
              channel: channel || undefined,
            },
            synthetic: dataset.synthetic,
            allow_model: false,
          }
        : null,
    [dataset, start, end, channel],
  );
  /** 载入所选演示账本并进入字段核对。 */
  function loadSample(scenario: Scenario) {
    request.current++;
    setBusy(false);
    setError("");
    setWarnings([]);
    setFile(null);
    setSheets([]);
    setSheet("");
    const data = parseCSVWithDiagnostics(
      rowsToCSV(generateDemo(scenario)),
    ).data;
    setRaw(data);
    setMapping(autoMap(data.headers));
    setFileName(
      `合成样例-${SCENARIOS.find((item) => item.key === scenario)?.title}.csv`,
    );
    setDataset(null);
    setSynthetic(true);
    setOptions({ assumePaid: false, assumeNoRefund: false });
    setAcceptRejected(false);
    navigateWorkspace("import");
    setNotice("");
  }
  /** 解析销售文件，并将格式、体积和解析错误反馈到导入页。 */
  async function parseFile(
    next: File,
    nextEncoding = encoding,
    nextDelimiter = delimiter,
    nextSheet?: string,
  ) {
    const token = ++request.current;
    setBusy(true);
    setError("");
    setDataset(null);
    setRaw(null);
    setAcceptRejected(false);
    setWarnings([]);
    setSynthetic(false);
    setView("import");
    try {
      if (!isSupportedFile(next.name))
        throw new Error("仅支持CSV和Excel（.xlsx），请先转换其他格式。");
      if (next.size > MAX_BYTES)
        throw new Error("文件超过5MB，请拆分后再导入。");
      if (!next.size) throw new Error("文件为空，请重新选择。");
      let data: CSVData;
      let names: string[] = [];
      let parsedWarnings: string[] = [];
      const bytes = await next.arrayBuffer();
      if (isXLSXFile(next.name)) {
        validateWorkbookArchive(bytes);
        names = await listXLSXSheets(next);
        data = await parseXLSX(next, {
          sheet: nextSheet || names[0],
          hasHeader: true,
        });
      } else {
        const content = decodeText(bytes, nextEncoding);
        if (content.includes("\uFFFD"))
          throw new Error(
            "文本解码出现替换字符，请尝试GB18030或UTF-16编码后重新解析。",
          );
        const result = parseCSVWithDiagnostics(content, {
          delimiter: nextDelimiter,
          encoding: nextEncoding,
          hasHeader: true,
          skipEmptyLines: true,
        });
        data = result.data;
        parsedWarnings = result.warnings.map(
          () =>
            "源文件存在不规则列宽、表头或引号；解析器已保留可读内容，请核对预览。",
        );
      }
      if (token !== request.current) return;
      if (!data.rows.length) throw new Error("选中的工作表没有数据行。");
      if (data.rows.length > MAX_ROWS)
        throw new Error("数据超过10,000行，请拆分后导入。");
      if (data.headers.length > 100)
        throw new Error("数据超过100列，请先删除无关列。");
      setRaw(data);
      setMapping(autoMap(data.headers));
      setFile(next);
      setFileName(next.name);
      setSheets(names);
      setSheet(nextSheet || names[0] || "");
      setWarnings([...new Set(parsedWarnings)]);
      setOptions({ assumePaid: false, assumeNoRefund: false });
    } catch (err) {
      if (token === request.current)
        setError(err instanceof Error ? err.message : "解析失败，请检查文件。");
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  /** 确认映射和数据质量检查，登记账本并进入看板。 */
  function confirmImport() {
    if (
      !normalized?.result?.rows.length ||
      (normalized.result.quality.rejected_rows > 0 && !acceptRejected)
    )
      return;
    setDataset({ ...normalized.result, fileName, synthetic });
    setStart("");
    setEnd("");
    setChannel("");
    navigateWorkspace("dashboard");
    setNotice("");
  }
  /** 在保留会话数据的情况下切换工作台页面。 */
  function navigateWorkspace(next: View) {
    setWorkspaceMenuOpen(false);
    setDashboardFiltersOpen(false);
    setView(next);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }
  /** 返回看板并展开筛选，方便调整当前统计范围。 */
  function adjustDashboardFilters() {
    navigateWorkspace("dashboard");
    setDashboardFiltersOpen(true);
  }
  /** 取消当前解析并清除会话中的文件与账本，返回导入步骤。 */
  function clear() {
    request.current++;
    setRaw(null);
    setDataset(null);
    setFile(null);
    setFileName("");
    setError("");
    setWarnings([]);
    setBusy(false);
    setSheets([]);
    setSearch("");
    setPage(0);
    setView("import");
    setNotice("已清除本次会话数据。");
  }
  const quality = normalized?.result?.quality;
  const preview =
    raw?.rows.filter(
      (row) =>
        !search ||
        row.some((cell) => cell.toLowerCase().includes(search.toLowerCase())),
    ) ?? [];
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(preview.length / 10) - 1),
  );
  /** 按扣退款销售额对分组排序，缺少退款数据时使用成交额。 */
  const ranked = (groups: Group[]) =>
    [...groups].sort((a, b) => {
      const aValue = totalUnits(a.net_sales ?? a.gross_sales);
      const bValue = totalUnits(b.net_sales ?? b.gross_sales);
      return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
    });
  const rankedChannels =
    view === "dashboard" && snapshot ? ranked(snapshot.channels) : [];
  const dashboardMetrics: Array<{
    title: string;
    value?: string | null;
    text?: string;
    note: string;
  }> = snapshot
    ? [
        {
          title: "扣退款销售额",
          value: snapshot.totals.net_sales,
          note: "成交金额 − 退款金额",
        },
        {
          title: "有效订单数",
          text:
            snapshot.totals.order_count?.toLocaleString("zh-CN") ?? "不可确定",
          note:
            snapshot.totals.order_count === null
              ? "缺少可靠订单ID，仅报告有效行数"
              : "按订单ID去重；取消单已排除",
        },
        {
          title: "贡献毛益",
          value: snapshot.totals.contribution,
          note: snapshot.totals.missing_fields.length
            ? `缺少：${snapshot.totals.missing_fields.map(label).join("、")}`
            : "扣退款销售额 − 全部可变成本",
        },
        {
          title: "贡献率",
          text:
            snapshot.totals.contribution_rate === null
              ? "不可计算"
              : `${(Number(snapshot.totals.contribution_rate) * 100).toFixed(2)}%`,
          note: "贡献毛益 ÷ 扣退款销售额",
        },
      ]
    : [];
  const canConfirm =
    !!normalized?.result?.rows.length &&
    (!quality?.rejected_rows || acceptRejected);
  const workspaceMenuButton = (
    <button
      type="button"
      className="workspace-mobile-control"
      aria-expanded={workspaceMenuOpen}
      aria-controls="workspace-mobile-nav"
      onClick={() => {
        setWorkspaceMenuOpen(!workspaceMenuOpen);
        setWorkspaceMenuHasMore(false);
        setDashboardFiltersOpen(false);
      }}
    >
      <Menu size={17} aria-hidden="true" />
      工作台菜单
    </button>
  );
  const workspaceMenu = (
    <div
      className="workspace-mobile-nav"
      id="workspace-mobile-nav"
      hidden={!workspaceMenuOpen}
    >
      <div
        className="workspace-mobile-nav-scroll"
        ref={workspaceMenuScroll}
        onScroll={(event) =>
          setWorkspaceMenuHasMore(hasMoreMenuEntries(event.currentTarget))
        }
      >
        <WorkspaceNavigation current={view} onNavigate={navigateWorkspace} />
      </div>
      {workspaceMenuHasMore && (
        <p className="workspace-mobile-nav-hint">
          <ChevronDown size={14} aria-hidden="true" />
          下滑查看更多
        </p>
      )}
    </div>
  );

  return (
    <div
      className={
        view === "dashboard"
          ? "growth-app growth-dashboard"
          : view === "import"
            ? "growth-app growth-import"
            : "growth-app"
      }
    >
      <a className="skip-link" href="#main">
        跳至主要内容
      </a>
      <aside className="sidebar">
        <WorkspaceBrand />
        <WorkspaceNavigation current={view} onNavigate={navigateWorkspace} />
      </aside>
      <div className="main-shell">
        {view !== "dashboard" && (
          <header className="workspace-mobile-header">
            <div className="workspace-mobile-header-row">
              <WorkspaceBrand />
              {workspaceMenuButton}
            </div>
            {workspaceMenu}
          </header>
        )}
        <main id="main">
          {view === "dashboard" ? (
            <header className="dashboard-heading">
              <div className="dashboard-heading-row">
                <h1>经营看板</h1>
                {workspaceMenuButton}
              </div>
              {workspaceMenu}
              {dataset && (
                <>
                  <div className="dashboard-scope">
                    <div className="dashboard-scope-values" aria-live="polite">
                      <span>
                        {dashboardStart || dashboardEnd
                          ? `${dashboardStart ?? "不限"} 至 ${dashboardEnd ?? "不限"}`
                          : "当前范围无有效交易"}
                      </span>
                      <span>{channel || "全部渠道"}</span>
                      <span
                        className={
                          dataset.synthetic ? "dashboard-demo-label" : undefined
                        }
                      >
                        {dataset.synthetic ? "合成演示数据" : "本地文件"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="workspace-mobile-control"
                      aria-expanded={dashboardFiltersOpen}
                      aria-controls="dashboard-filters"
                      onClick={() => {
                        setDashboardFiltersOpen(!dashboardFiltersOpen);
                        setWorkspaceMenuOpen(false);
                      }}
                    >
                      <SlidersHorizontal size={16} aria-hidden="true" />
                      筛选
                    </button>
                  </div>
                  <div
                    id="dashboard-filters"
                    className="filters dashboard-filters"
                    data-expanded={dashboardFiltersOpen}
                  >
                    <label>
                      开始日期
                      <input
                        type="date"
                        value={start}
                        onChange={(event) => setStart(event.target.value)}
                      />
                    </label>
                    <label>
                      结束日期
                      <input
                        type="date"
                        value={end}
                        onChange={(event) => setEnd(event.target.value)}
                      />
                    </label>
                    <label>
                      销售渠道
                      <select
                        value={channel}
                        onChange={(event) => setChannel(event.target.value)}
                      >
                        <option value="">全部渠道</option>
                        {[
                          ...new Set(dataset.rows.map((row) => row.channel)),
                        ].map((name) => (
                          <option key={name}>{name}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setStart("");
                        setEnd("");
                        setChannel("");
                      }}
                    >
                      重置筛选
                    </button>
                  </div>
                </>
              )}
            </header>
          ) : view === "import" ? (
            <header className="import-heading">
              <h1>{pages.import.title}</h1>
            </header>
          ) : (
            <header className="page-heading">
              <h1>{pages[view].title}</h1>
            </header>
          )}
          {notice && (
            <div role="status" className="info-banner">
              {notice}
            </div>
          )}
          {view === "import" ? (
            <>
              <div className={raw ? "import-entry has-file" : "import-entry"}>
                <section className="panel import-panel">
                  {raw && (
                    <div className="section-title">
                      <h2>确认字段，让数据对得上</h2>
                      <button className="text-button" onClick={clear}>
                        <X size={14} />
                        清除并重新导入
                      </button>
                    </div>
                  )}
                  {!raw && (
                    <>
                      <label
                        className={`dropzone ${busy ? "busy" : ""}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (event.dataTransfer.files[0])
                            void parseFile(event.dataTransfer.files[0]);
                        }}
                      >
                        <span className="upload-action">
                          <Upload size={17} aria-hidden="true" />
                          {busy ? "正在解析文件…" : "选择销售数据文件"}
                        </span>
                        <span className="upload-formats">
                          CSV / Excel · 最大 5 MB
                        </span>
                        <input
                          ref={fileInput}
                          aria-label="选择销售数据文件"
                          type="file"
                          accept={SPREADSHEET_ACCEPT}
                          disabled={busy}
                          onChange={(event) => {
                            const selected = event.target.files?.[0];
                            if (selected) void parseFile(selected);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </>
                  )}
                  <details className="parse-settings">
                    <summary>模板与导入选项</summary>
                    <p className="import-field-note">
                      必填：订单日期、SKU、商品名称、渠道、销量、单价。最多
                      10,000 行。
                    </p>
                    <div className="privacy-note">
                      <ShieldCheck size={16} aria-hidden="true" />
                      <p>请删除姓名、电话和地址。原始文件仅在浏览器内解析。</p>
                    </div>
                    <div className="file-tools">
                      <button
                        className="text-button"
                        onClick={() =>
                          download(rowsToCSV([], true), "里下河-标准模板.csv")
                        }
                      >
                        <Download size={15} />
                        下载CSV模板
                      </button>
                      <a
                        className="text-button"
                        href="/templates/lixiahe-template.xlsx"
                        download
                      >
                        <Download size={15} />
                        Excel模板
                      </a>
                      <button
                        className="text-button"
                        onClick={() =>
                          download(
                            rowsToCSV(generateDemo(), true),
                            "里下河-合成样例.csv",
                          )
                        }
                      >
                        <Download size={15} />
                        下载样例 CSV
                      </button>
                    </div>
                    <div className="control-row">
                      <label>
                        CSV编码
                        <select
                          value={encoding}
                          onChange={(event) => setEncoding(event.target.value)}
                        >
                          <option value="utf-8">UTF-8</option>
                          <option value="gb18030">GB18030 / GBK</option>
                          <option value="utf-16le">UTF-16 LE</option>
                        </select>
                      </label>
                      <label>
                        CSV分隔符
                        <select
                          value={delimiter}
                          onChange={(event) => setDelimiter(event.target.value)}
                        >
                          <option value="">自动识别</option>
                          <option value=",">逗号</option>
                          <option value=";">分号</option>
                          <option value={"\t"}>制表符</option>
                        </select>
                      </label>
                      {file && (
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void parseFile(file, encoding, delimiter, sheet)
                          }
                        >
                          按当前设置重新解析
                        </button>
                      )}
                    </div>
                  </details>
                  {error && (
                    <div className="error-banner" role="alert">
                      <AlertCircle size={17} />
                      {error}
                    </div>
                  )}
                  {warnings.map((warning) => (
                    <p className="warning-banner" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {raw && (
                    <>
                      <div className="file-summary">
                        <FileSpreadsheet size={22} />
                        <div>
                          <strong>{fileName}</strong>
                          <small>
                            {raw.rowCount.toLocaleString("zh-CN")} 行 ·{" "}
                            {raw.headers.length} 列{" "}
                            {synthetic ? "· 合成数据" : "· 用户选择的文件"}
                          </small>
                        </div>
                        {sheets.length > 0 && (
                          <label>
                            工作表
                            <select
                              value={sheet}
                              onChange={(event) =>
                                void parseFile(
                                  file!,
                                  encoding,
                                  delimiter,
                                  event.target.value,
                                )
                              }
                            >
                              {sheets.map((name) => (
                                <option key={name}>{name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                      <div className="mapping-grid">
                        {FIELDS.map((field) => (
                          <label key={field.key}>
                            <span>
                              {field.label}
                              {field.required && <b aria-label="必填"> *</b>}
                            </span>
                            <select
                              aria-label={`映射${field.label}`}
                              value={mapping[field.key] ?? ""}
                              onChange={(event) => {
                                setMapping({
                                  ...mapping,
                                  [field.key]: event.target.value || undefined,
                                });
                                setAcceptRejected(false);
                              }}
                            >
                              <option value="">
                                {field.required
                                  ? "请选择源列"
                                  : "未提供，保留未知"}
                              </option>
                              {raw.headers.map((header) => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div className="assumptions">
                        <p>
                          <strong>明确数据口径</strong>
                          　填写该订单行的实际分摊费用。空白成本标为待补，0按已填成本计算。
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={options.assumePaid}
                            onChange={(event) => {
                              setOptions({
                                ...options,
                                assumePaid: event.target.checked,
                              });
                              setAcceptRejected(false);
                            }}
                          />
                          我确认：空白订单状态均为已支付
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={options.assumeNoRefund}
                            onChange={(event) => {
                              setOptions({
                                ...options,
                                assumeNoRefund: event.target.checked,
                              });
                              setAcceptRejected(false);
                            }}
                          />
                          我确认：空白退款金额代表没有退款
                        </label>
                      </div>
                      {normalized?.error && (
                        <div role="alert" className="error-banner">
                          {normalized.error}
                        </div>
                      )}
                      {quality && <QualityPanel quality={quality} />}
                      {!!quality?.rejected_rows && (
                        <label className="reject-confirm">
                          <input
                            type="checkbox"
                            checked={acceptRejected}
                            onChange={(event) =>
                              setAcceptRejected(event.target.checked)
                            }
                          />
                          我已查看错误，确认剔除{quality.rejected_rows}
                          行，仅分析
                          {quality.valid_rows}行有效数据
                        </label>
                      )}
                      <div className="confirm-row">
                        <p>取消单会在分析时排除；退款单保留实际成本。</p>
                        <button
                          className="button primary"
                          disabled={!canConfirm || busy}
                          onClick={confirmImport}
                        >
                          确认导入，查看看板
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    </>
                  )}
                </section>
                {!raw && (
                  <section
                    className="import-samples"
                    aria-labelledby="import-samples-title"
                  >
                    <h2 id="import-samples-title">使用演示样例</h2>
                    <p className="import-sample-note">虚构商家 · 合成交易</p>
                    <ul className="import-sample-list">
                      {SCENARIOS.map((scenario) => (
                        <li key={scenario.key}>
                          <button
                            type="button"
                            aria-label={`载入样例：${scenario.title}`}
                            onClick={() => loadSample(scenario.key)}
                          >
                            <span>{scenario.title}</span>
                            <ArrowRight size={17} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
              {raw && (
                <section className="panel">
                  <div className="section-title">
                    <h2>原始数据预览</h2>
                    <input
                      type="search"
                      aria-label="搜索原始数据"
                      placeholder="搜索所有行…"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(0);
                      }}
                    />
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {raw.headers.map((header) => (
                            <th key={header}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview
                          .slice(currentPage * 10, (currentPage + 1) * 10)
                          .map((row, index) => (
                            <tr key={index}>
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} title={cell}>
                                  {cell || "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        {!preview.length && (
                          <tr>
                            <td colSpan={raw.headers.length}>没有匹配的数据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="pagination">
                    <span>
                      共{preview.length}行 · 第{currentPage + 1}/
                      {Math.max(1, Math.ceil(preview.length / 10))}页
                    </span>
                    <button
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      上一页
                    </button>
                    <button
                      disabled={(currentPage + 1) * 10 >= preview.length}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </section>
              )}
            </>
          ) : view !== "dashboard" ? null : !dataset ? (
            <WorkspaceEmptyState
              title="还没有销售数据"
              primary={{
                label: "导入销售数据",
                /** 从看板空状态打开导入。 */
                onClick: () => navigateWorkspace("import"),
              }}
              secondary={{
                label: "使用演示样例",
                /** 用正常经营样例填充待核对账本。 */
                onClick: () => loadSample("normal"),
              }}
            />
          ) : (
            <>
              {computed?.error && (
                <div role="alert" className="error-banner">
                  {computed.error}
                </div>
              )}
              {snapshot && !snapshot.totals.line_count ? (
                <WorkspaceEmptyState
                  title="当前范围没有有效交易"
                  primary={{
                    label: "调整统计范围",
                    onClick: adjustDashboardFilters,
                  }}
                />
              ) : (
                snapshot && (
                  <>
                    <div className="kpi-grid">
                      {dashboardMetrics.map((metric) => (
                        <MetricCard key={metric.title} {...metric} />
                      ))}
                    </div>
                    <details className="metric-definitions">
                      <summary>指标口径</summary>
                      <dl>
                        {dashboardMetrics
                          .filter(
                            (metric) =>
                              metric.value !== null &&
                              metric.text !== "不可计算" &&
                              metric.text !== "不可确定",
                          )
                          .map((metric) => (
                            <div key={metric.title}>
                              <dt>{metric.title}</dt>
                              <dd>{metric.note}</dd>
                            </div>
                          ))}
                      </dl>
                    </details>
                    <p className="dashboard-count">
                      {snapshot.totals.line_count
                        ? `已排除${snapshot.scope.cancelled}行取消单 · ${snapshot.totals.line_count}行参与计算`
                        : "当前筛选范围没有有效交易"}
                    </p>
                    <div className="submetrics">
                      <span>
                        商品成交额 <b>¥{money(snapshot.totals.gross_sales)}</b>
                      </span>
                      <span>
                        已知退款 <b>¥{money(snapshot.totals.known_refunds)}</b>
                      </span>
                      <span>
                        销量 <b>{snapshot.totals.quantity} 件</b>
                      </span>
                      <span>
                        {snapshot.totals.order_count === null
                          ? "行均金额"
                          : "客单价"}{" "}
                        <b>
                          {snapshot.totals.net_sales === null
                            ? "数据不足"
                            : `¥${money(snapshot.totals.order_count === null ? snapshot.totals.average_line_value : snapshot.totals.average_order_value)}`}
                        </b>
                      </span>
                    </div>
                    {!!snapshot.quality.duplicate_order_ids.length && (
                      <div className="warning-banner">
                        当前有{snapshot.quality.duplicate_order_ids.length}
                        个重复订单ID：可能为多商品行或重复导出。金额未擅自去重，请核对。
                      </div>
                    )}
                    <section className="dashboard-next" aria-label="下一步">
                      <button
                        className="button primary"
                        onClick={() => navigateWorkspace("diagnose")}
                      >
                        进入经营诊断
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </section>
                    <div className="chart-grid">
                      <section className="panel">
                        <div className="section-title">
                          <div>
                            <h2>销售趋势</h2>
                            <p>扣退款销售额 · 元</p>
                          </div>
                        </div>
                        {snapshot.daily.length &&
                        snapshot.totals.net_sales !== null ? (
                          <div
                            className="chart-wrap"
                            role="img"
                            aria-label="每日扣退款销售额趋势，精确数据见汇总表"
                          >
                            <ResponsiveContainer width="100%" height={245}>
                              <AreaChart
                                data={snapshot.daily.map((group) => ({
                                  date: group.key.slice(5),
                                  amount: Number(group.net_sales),
                                }))}
                                margin={{
                                  top: 12,
                                  right: 10,
                                  left: 8,
                                  bottom: 0,
                                }}
                              >
                                <CartesianGrid
                                  vertical={false}
                                  stroke="var(--line)"
                                />
                                <XAxis
                                  dataKey="date"
                                  tickLine={false}
                                  axisLine={false}
                                  minTickGap={35}
                                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                                />
                                <YAxis
                                  tickFormatter={shortNumber}
                                  tickLine={false}
                                  axisLine={false}
                                  width={46}
                                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                                />
                                <Tooltip
                                  formatter={(value) => [
                                    `¥${money(String(value))}`,
                                    "销售额",
                                  ]}
                                />
                                <Area
                                  dataKey="amount"
                                  stroke="var(--chart-primary)"
                                  fill="var(--chart-fill)"
                                  strokeWidth={2}
                                  isAnimationActive={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="chart-empty">
                            {snapshot.totals.net_sales === null
                              ? "退款数据不完整，无法展示扣退款趋势。"
                              : "当前范围没有数据。"}
                          </div>
                        )}
                        <div className="chart-foot">
                          最近7日对比前7日：
                          {snapshot.comparison.status === "new"
                            ? "新产生，不计算百分比"
                            : snapshot.comparison.status === "comparable"
                              ? `${(Number(snapshot.comparison.value) * 100).toFixed(2)}%`
                              : "数据不足 / 不可比较"}
                          <small>
                            {snapshot.comparison.prior_start}—
                            {snapshot.comparison.prior_end} →{" "}
                            {snapshot.comparison.current_start}—
                            {snapshot.comparison.current_end}
                          </small>
                        </div>
                      </section>
                      <section className="panel dashboard-channel-chart">
                        <div className="section-title">
                          <div>
                            <h2>渠道贡献对照</h2>
                            <p>销售额与贡献毛益 · 元</p>
                          </div>
                        </div>
                        {snapshot.channels.length ? (
                          <div
                            className="chart-wrap"
                            role="img"
                            aria-label="渠道销售额与贡献毛益对照，精确数据见下表"
                          >
                            <ResponsiveContainer width="100%" height={245}>
                              <BarChart
                                data={rankedChannels.map((group) => ({
                                  name: group.key,
                                  sales:
                                    group.net_sales === null
                                      ? null
                                      : Number(group.net_sales),
                                  contribution:
                                    group.contribution === null
                                      ? null
                                      : Number(group.contribution),
                                }))}
                                margin={{
                                  top: 12,
                                  right: 10,
                                  left: 8,
                                  bottom: 0,
                                }}
                              >
                                <CartesianGrid
                                  vertical={false}
                                  stroke="var(--line)"
                                />
                                <XAxis
                                  dataKey="name"
                                  tickLine={false}
                                  axisLine={false}
                                  tick={{ fontSize: 11 }}
                                />
                                <YAxis
                                  tickFormatter={shortNumber}
                                  tickLine={false}
                                  axisLine={false}
                                  width={46}
                                  tick={{ fontSize: 11 }}
                                />
                                <Tooltip
                                  formatter={(value, name) => [
                                    `¥${money(String(value))}`,
                                    name === "sales"
                                      ? "扣退款销售额"
                                      : "贡献毛益",
                                  ]}
                                />
                                <Bar
                                  dataKey="sales"
                                  fill="var(--chart-primary)"
                                  radius={[3, 3, 0, 0]}
                                  isAnimationActive={false}
                                />
                                <Bar
                                  dataKey="contribution"
                                  fill="var(--chart-secondary)"
                                  radius={[3, 3, 0, 0]}
                                  isAnimationActive={false}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="chart-empty">当前范围没有数据。</div>
                        )}
                        <div className="legend">
                          <span>
                            <i />
                            扣退款销售额
                          </span>
                          <span>
                            <i />
                            贡献毛益
                          </span>
                        </div>
                        {rankedChannels.length > 0 && (
                          <table className="dashboard-channel-values">
                            <thead>
                              <tr>
                                <th scope="col">渠道</th>
                                <th scope="col">贡献毛益</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rankedChannels.map(
                                ({ key, name, contribution }) => (
                                  <tr key={key}>
                                    <th scope="row">{name}</th>
                                    <td
                                      className={
                                        contribution?.startsWith("-")
                                          ? "negative"
                                          : undefined
                                      }
                                    >
                                      {contribution === null
                                        ? "数据不足"
                                        : `¥${money(contribution)}`}
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        )}
                      </section>
                    </div>
                    <div className="rank-grid">
                      <GroupTable title="渠道表现" groups={rankedChannels} />
                      <GroupTable
                        title="商品表现"
                        groups={ranked(snapshot.skus)}
                      />
                    </div>
                    <details className="panel methodology">
                      <summary>查看计算口径</summary>
                      <ul>
                        <li>
                          贡献毛益 = 扣退款销售额 − 数量×单位成本 − 运费 −
                          平台费 − 广告费。
                        </li>
                        <li>
                          成本字段完整时显示贡献毛益，缺失时显示“数据不足”。明确填写的0是已知成本，空白为待补字段。
                        </li>
                        <li>
                          金额采用BigInt定点十进制计算，乘积保留16位小数，展示时四舍五入到分。图表转换成数值仅用于绘制。
                        </li>
                        <li>
                          订单ID重复仅用于提示与订单计数；多行商品金额照常计入。请自行确认重复导出并预先分摊订单费用。
                        </li>
                        <li>
                          退款归入订单日期。日期筛选包含起止两日，最近7日比较使用完整14日数据。
                        </li>
                      </ul>
                    </details>
                    <section className="panel">
                      <div className="section-title">
                        <h2>数据与复核</h2>
                        <button
                          className="text-button"
                          onClick={() => setShowSource(!showSource)}
                        >
                          {showSource ? "收起" : "查看"}导入质量
                        </button>
                      </div>
                      <p className="fineprint">数据文件 {dataset.fileName}</p>
                      <p className="fineprint">
                        经营报告采用当前筛选范围，可先导出数据摘要，也可附上诊断和营销草稿。
                      </p>
                      {showSource && <QualityPanel quality={dataset.quality} />}
                      <div className="file-tools">
                        <button
                          className="text-button"
                          onClick={() => navigateWorkspace("import")}
                        >
                          修改映射与口径
                          <ArrowRight size={14} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setView("report")}
                        >
                          <ArrowRight size={15} />
                          查看经营报告
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            download(
                              JSON.stringify(snapshot, null, 2),
                              "里下河-指标快照.json",
                              "application/json",
                            )
                          }
                        >
                          <Download size={15} />
                          下载指标快照
                        </button>
                        <button className="text-button" onClick={clear}>
                          <X size={15} />
                          清除本次会话
                        </button>
                      </div>
                    </section>
                  </>
                )
              )}
            </>
          )}
          <AgentWorkbench
            view={
              view === "diagnose" ||
              view === "content" ||
              view === "knowledge" ||
              view === "report"
                ? view
                : null
            }
            input={agentInput}
            snapshot={snapshot ?? null}
            quality={dataset?.quality}
            onNavigate={navigateWorkspace}
            onAdjustFilters={adjustDashboardFilters}
            onUseSample={() => loadSample("normal")}
          />
        </main>
      </div>
    </div>
  );
}
/** 显示核心指标、状态和需要时可展开的计算口径。 */
function MetricCard({
  title,
  value,
  text,
  note,
}: {
  title: string;
  value?: string | null;
  text?: string;
  note: string;
}) {
  return (
    <section className="kpi">
      <h2>{title}</h2>
      <strong
        className={
          value === null || text === "不可计算" || text === "不可确定"
            ? "unavailable"
            : ""
        }
      >
        {text ??
          (value === null ? (
            "数据不足"
          ) : (
            <>
              <small>¥</small>
              {money(value ?? null)}
            </>
          ))}
      </strong>
      {(value === null || text === "不可计算" || text === "不可确定") && (
        <p>{note}</p>
      )}
    </section>
  );
}
/** 用同一组经营指标比较渠道或商品。 */
function GroupTable({ title, groups }: { title: string; groups: Group[] }) {
  return (
    <section className="panel">
      <div className="section-title">
        <h2>{title}</h2>
        <span className="fineprint">按销售额排序</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>扣退款销售额 / 元</th>
              <th>贡献毛益 / 元</th>
              <th>销量</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, index) => (
              <tr key={group.key}>
                <td>
                  <span className="rank-number">{index + 1}</span>
                  {group.name}
                </td>
                <td>{money(group.net_sales)}</td>
                <td
                  className={
                    group.contribution?.startsWith("-") ? "negative" : ""
                  }
                >
                  {money(group.contribution)}
                </td>
                <td>{group.quantity}</td>
              </tr>
            ))}
            {!groups.length && (
              <tr>
                <td colSpan={4}>当前筛选范围没有数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
/** 汇总数据校验结果，并展开被拒行等核对细节。 */
function QualityPanel({ quality }: { quality: QualityReport }) {
  return (
    <div className="quality-panel">
      <div className="quality-stats">
        <span>
          <CheckCircle2 size={17} />
          <b>{quality.valid_rows}</b>有效行
        </span>
        <span className={quality.rejected_rows ? "negative" : ""}>
          <AlertCircle size={17} />
          <b>{quality.rejected_rows}</b>剔除行
        </span>
        <span>
          <b>{quality.duplicate_order_ids.length}</b>重复订单ID
        </span>
        <span>
          <b>{quality.extreme_rows.length}</b>极端值行
        </span>
      </div>
      <p className="fineprint">
        日期范围：{quality.period.start ?? "未知"} —{" "}
        {quality.period.end ?? "未知"}；有效行含取消单，分析时会再排除。
      </p>
      {Object.entries(quality.missing_counts).length > 0 && (
        <div className="missing-fields">
          {Object.entries(quality.missing_counts).map(([field, count]) => (
            <span key={field}>
              {label(field)}缺失 {count}行
            </span>
          ))}
        </div>
      )}
      {quality.warnings.map((warning) => (
        <p className="warning-banner" key={warning}>
          {warning}
        </p>
      ))}
      {quality.issues.length > 0 && (
        <details open>
          <summary>
            错误行详情（{quality.issues.length}项，最多展示100项）
          </summary>
          <div className="table-scroll error-table">
            <table>
              <thead>
                <tr>
                  <th>原始行号</th>
                  <th>字段</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {quality.issues.slice(0, 100).map((issue, index) => (
                  <tr key={index}>
                    <td>{issue.row}</td>
                    <td>{label(issue.field)}</td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
