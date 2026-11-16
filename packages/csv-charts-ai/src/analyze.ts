import { generateObject, generateText, streamText } from "ai";
import { z } from "zod";
import type { TabularData, ChartConfig } from "./types";
import type { ModelInput } from "./ai";
import {
  clipCell,
  resolveModel,
  suggestCharts,
  summarizeTabularData,
  toAIError,
  validateTabularData,
} from "./ai";

// ============ Schemas ============

const DataSummarySchema = z.object({
  summary: z.string(),
  keyInsights: z.array(z.string()),
  dataQuality: z.string(),
});

const AnomalySchema = z.object({
  row: z.number(),
  column: z.string(),
  value: z.string(),
  issue: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

const AnomaliesResponseSchema = z.object({
  anomalies: z.array(AnomalySchema),
});

// ============ Result Types ============

export interface DataSummaryResult {
  summary: string;
  keyInsights: string[];
  dataQuality: string;
}

export interface AnomalyResult {
  row: number;
  column: string;
  value: string;
  issue: string;
  severity: "low" | "medium" | "high";
}

export interface AnalysisResult {
  summary: DataSummaryResult;
  anomalies: AnomalyResult[];
  charts: ChartConfig[];
}

// ============ Prompts ============

/** 设置数据摘要请求的输出语言和结构。 */
const summarySystemPrompt = (
  language?: string,
) => `You are a data analyst.${language ? ` Respond in ${language}.` : ""}

Analyze the provided CSV data summary and provide:
1. A comprehensive summary of what this dataset represents (2-3 sentences)
2. 3-5 key insights or patterns you notice
3. An assessment of data quality (completeness, consistency)`;

/** 设置异常识别请求的输出语言、格式和判断要求。 */
const anomalySystemPrompt = (
  language?: string,
) => `You are a data quality expert.${language ? ` Respond in ${language}.` : ""}

Analyze the provided CSV data and identify anomalies, outliers, or suspicious data points.

For each anomaly found, provide:
1. Row number (1-indexed, excluding header)
2. Column name
3. The problematic value
4. Description of the issue
5. Severity (low, medium, high)

Look for:
- Missing or empty values where data is expected
- Values that don't match the expected type
- Outliers (extremely high or low values)
- Inconsistent formatting
- Invalid dates or formats

Analyze ALL rows provided. Return empty array if no anomalies found.

The rows provided may be only the first rows of a larger dataset: the others are
left out on purpose, and the summary statistics and group totals cover every row.
Never report the number of rows, missing or truncated rows, or totals that the
rows provided do not add up to: report only problems in the values you see.`;

/** 设置数据问答的语言和回答范围。 */
const questionSystemPrompt = (language?: string) =>
  `You are a data analysis expert.${language ? ` Respond in ${language}.` : ""}

The user will ask questions about a CSV dataset. Respond clearly and precisely.

You receive a summary computed on every row (column statistics, group totals)
and the rows themselves, all of them or the first ones when the file is large.
- Totals, averages and counts over the whole dataset: take them from the summary.
- Individual rows and values: use only the rows provided. When a question needs
  a row or a value you were not given, say that it is not in the rows you
  received. Never infer, extrapolate or guess a value you cannot see.
- Rows left out of a large file are left out on purpose: the data is not truncated.`;

// ============ Helper ============

/** 按 CSV 规则转义提示词中出现的表格单元格。 */
function escapeCSVField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 将抽样行变成带表头的 CSV，控制模型上下文大小。 */
function buildSampleCSV(data: TabularData, maxRows = 50): string {
  /** 裁剪过长的样例值再执行 CSV 转义。 */
  const cell = (value: string) => escapeCSVField(clipCell(value));
  const header = data.headers.map(cell).join(",");
  const rows = data.rows
    .slice(0, maxRows)
    .map((row) => row.map(cell).join(","))
    .join("\n");
  return `${header}\n${rows}`;
}

/** Character budget of the rows sent with a chat question. */
export const CHAT_ROWS_MAX_CHARS = 20_000;

/**
 * The rows sent with a chat question, as CSV under a heading saying which
 * ones: all of them, or the first rows that fit `maxChars`. Empty without rows.
 * 根据数据量选择可放入问答上下文的行。
 */
function rowsForChat(data: TabularData, maxChars: number): string {
  if (data.rows.length === 0 || maxChars <= 0) return "";
  /** 将用于异常校验的样例值转换为安全的 CSV 字段。 */
  const cell = (value: string) => escapeCSVField(clipCell(value));
  const lines = [data.headers.map(cell).join(",")];
  let size = lines[0]!.length;
  for (const row of data.rows) {
    const line = row.map(cell).join(",");
    if (size + line.length + 1 > maxChars && lines.length > 1) break;
    lines.push(line);
    size += line.length + 1;
  }
  return `${sampleHeading(data, lines.length - 1)}\n${lines.join("\n")}\n\n`;
}

/**
 * The heading of the rows sent to the model. When they are a sample,
 * it says so: otherwise the model, told the dataset has more rows, reports the
 * sample itself as truncated data.
 * 说明模型接收到的是全量数据还是抽样行。
 */
function sampleHeading(data: TabularData, maxRows: number): string {
  const total = Math.max(data.rowCount, data.rows.length);
  const shown = Math.min(maxRows, data.rows.length);
  return shown < total
    ? `Data to analyze (CSV format): rows 1 to ${shown} of ${total}. The other ${total - shown} rows are left out on purpose; the summary above covers all ${total}.`
    : `Data to analyze (CSV format): all ${total} rows.`;
}

/** One question/answer pair of a chat about the data. */
export interface ChatHistoryItem {
  prompt: string;
  response: string;
  /** Failed answers are not sent back to the model. */
  error?: boolean;
}

/** Most previous turns sent back to the model. */
export const MAX_HISTORY_TURNS = 10;
/** Character budget of the conversation history in a prompt. */
export const MAX_HISTORY_CHARS = 12_000;

/**
 * Keep the most recent successful turns that fit the budget, oldest first.
 * Failed or empty answers are left out.
 * 将有限的历史问答拼入模型上下文。
 */
export function buildHistoryContext(
  history: ChatHistoryItem[],
  maxTurns = MAX_HISTORY_TURNS,
  maxChars = MAX_HISTORY_CHARS,
): string {
  const turns: string[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && turns.length < maxTurns; i--) {
    const item = history[i]!;
    if (item.error || !item.response.trim()) continue;
    const turn = `User: ${item.prompt}\nAI: ${item.response}`;
    if (used + turn.length > maxChars) break;
    used += turn.length;
    turns.unshift(turn);
  }
  return turns.length
    ? `Previous conversation history:\n${turns.join("\n\n")}\n\n`
    : "";
}

// ============ Individual Functions ============

export interface SummarizeDataOptions {
  model: ModelInput;
  data: TabularData;
  dataSummary?: string;
  language?: string;
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
}

/**
 * Generate an AI summary of tabular data.
 *
 * @example
 * ```ts
 * const result = await summarizeData({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 * });
 * console.log(result.summary);
 * console.log(result.keyInsights);
 * console.log(result.dataQuality);
 * ```
 * 让模型根据数据摘要和样例生成可读分析。
 */
export async function summarizeData(
  options: SummarizeDataOptions,
): Promise<DataSummaryResult> {
  const { data, language, temperature = 0.5, signal, maxRetries } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: DataSummarySchema,
      system: summarySystemPrompt(language),
      prompt: `Here is the data to analyze:\n\n${dataSummary}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return {
      summary: object.summary,
      keyInsights: object.keyInsights,
      dataQuality: object.dataQuality,
    };
  } catch (error) {
    throw toAIError(error);
  }
}

export interface DetectAnomaliesOptions {
  model: ModelInput;
  data: TabularData;
  dataSummary?: string;
  /** Max rows to send for analysis (default: 50) */
  maxRows?: number;
  language?: string;
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
}

/**
 * Detect anomalies in tabular data using AI.
 *
 * @example
 * ```ts
 * const anomalies = await detectAnomalies({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 * });
 * anomalies.forEach(a => console.log(`Row ${a.row}: ${a.issue}`));
 * ```
 * 请求结构化异常信息，并检查返回字段是否存在于原表。
 */
export async function detectAnomalies(
  options: DetectAnomaliesOptions,
): Promise<AnomalyResult[]> {
  const {
    data,
    maxRows = 50,
    language,
    temperature = 0.3,
    signal,
    maxRetries,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const sampleCSV = buildSampleCSV(data, maxRows);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: AnomaliesResponseSchema,
      system: anomalySystemPrompt(language),
      prompt: `Data summary:\n${dataSummary}\n\n${sampleHeading(data, maxRows)}\n${sampleCSV}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return object.anomalies;
  } catch (error) {
    throw toAIError(error);
  }
}

export interface AskAboutDataOptions {
  model: ModelInput;
  data: TabularData;
  question: string;
  dataSummary?: string;
  /** Previous conversation messages for context (the latest turns that fit a budget are sent) */
  history?: ChatHistoryItem[];
  /** Characters of rows sent with the question, as CSV (default {@link CHAT_ROWS_MAX_CHARS}, 0 for none). */
  maxRowChars?: number;
  language?: string;
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
}

/**
 * Ask a question about the data and get a text response.
 *
 * @example
 * ```ts
 * const answer = await askAboutData({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 *   question: "What is the average revenue by category?",
 * });
 * console.log(answer);
 * ```
 * 发起一次数据问答并返回完整文本。
 */
export async function askAboutData(
  options: AskAboutDataOptions,
): Promise<string> {
  const {
    data,
    question,
    history = [],
    language,
    temperature = 0.5,
    signal,
    maxRetries,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);
    const contextPrompt = buildHistoryContext(history);
    const rows = rowsForChat(data, options.maxRowChars ?? CHAT_ROWS_MAX_CHARS);

    const { text } = await generateText({
      model,
      system: questionSystemPrompt(language),
      prompt: `Here is the data:\n\n${dataSummary}\n\n${rows}${contextPrompt}User question: ${question}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return text;
  } catch (error) {
    throw toAIError(error);
  }
}

export interface StreamAskAboutDataOptions extends Omit<
  AskAboutDataOptions,
  "signal"
> {
  onChunk: (chunk: string) => void;
  onComplete: (fullText: string) => void;
  /** AbortSignal to cancel the stream */
  signal?: AbortSignal;
}

/**
 * Ask a question with streaming response.
 *
 * @example
 * ```ts
 * await streamAskAboutData({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 *   question: "What trends do you see?",
 *   onChunk: (chunk) => process.stdout.write(chunk),
 *   onComplete: (full) => console.log("\nDone:", full.length, "chars"),
 * });
 * ```
 * 启动流式数据问答，向调用方逐步提供模型输出。
 */
export async function streamAskAboutData(
  options: StreamAskAboutDataOptions,
): Promise<void> {
  const {
    data,
    question,
    history = [],
    language,
    temperature = 0.5,
    signal,
    maxRetries,
    onChunk,
    onComplete,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);
    const contextPrompt = buildHistoryContext(history);
    const rows = rowsForChat(data, options.maxRowChars ?? CHAT_ROWS_MAX_CHARS);

    let streamError: Error | null = null;

    const result = streamText({
      model,
      system: questionSystemPrompt(language),
      prompt: `Here is the data:\n\n${dataSummary}\n\n${rows}${contextPrompt}User question: ${question}`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
      /** 记录流式请求错误，供结束时统一处理。 */
      onError: ({ error }) => {
        streamError = error instanceof Error ? error : new Error(String(error));
      },
    });

    let fullText = "";

    for await (const textPart of result.textStream) {
      fullText += textPart;
      onChunk(textPart);
    }

    if (streamError) throw streamError;

    const finishReason = await result.finishReason;
    if (finishReason === "error") {
      throw new Error(
        "The AI model encountered an error while generating the response.",
      );
    }

    onComplete(fullText);
  } catch (error) {
    throw toAIError(error);
  }
}

// ============ Full Pipeline ============

export interface AnalyzeOptions {
  model: ModelInput;
  data: TabularData;
  dataSummary?: string;
  language?: string;
  /** Set to false to skip anomaly detection (default: true) */
  detectAnomalies?: boolean;
  /** Set to false to skip chart suggestions (default: true) */
  suggestCharts?: boolean;
  /** AbortSignal to cancel all parallel requests */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). */
  maxRetries?: number;
}

/**
 * Run a complete AI analysis on tabular data in one call.
 * Returns summary, anomalies, and chart suggestions.
 *
 * @example
 * ```ts
 * import { analyzeData, ChartDisplay } from "csv-charts-ai";
 *
 * const result = await analyzeData({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myCSVData,
 * });
 *
 * console.log(result.summary.keyInsights);
 * console.log(`Found ${result.anomalies.length} anomalies`);
 *
 * // Render charts
 * <ChartDisplay data={myCSVData} charts={result.charts} />
 * ```
 * 并行获取数据摘要、异常和图表建议，并共享取消信号。
 */
export async function analyzeData(
  options: AnalyzeOptions,
): Promise<AnalysisResult> {
  const {
    data,
    language,
    signal,
    detectAnomalies: runAnomalies = true,
    suggestCharts: runCharts = true,
    maxRetries,
  } = options;
  try {
    validateTabularData(data);
  } catch (error) {
    throw toAIError(error);
  }
  const dataSummary = options.dataSummary ?? summarizeTabularData(data);

  // The first failure cancels the sibling requests instead of letting them run on
  const controller = new AbortController();
  /** 将外部取消信号传给并行分析使用的控制器。 */
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  const shared = {
    model: options.model,
    data,
    dataSummary,
    language,
    signal: controller.signal,
    maxRetries,
  };
  /** 某项分析失败时取消其他任务，并继续抛出错误。 */
  const cancelOnFailure = <T>(promise: Promise<T>) =>
    promise.catch((error: unknown) => {
      controller.abort(error);
      throw error;
    });

  try {
    // Run all in parallel
    const [summary, anomalies, charts] = await Promise.all([
      cancelOnFailure(summarizeData(shared)),
      runAnomalies
        ? cancelOnFailure(detectAnomalies(shared))
        : Promise.resolve([]),
      runCharts ? cancelOnFailure(suggestCharts(shared)) : Promise.resolve([]),
    ]);
    return { summary, anomalies, charts };
  } finally {
    signal?.removeEventListener("abort", forwardAbort);
  }
}

// ============ Question Suggestions ============

/** 指定后续问题生成的语言和内容范围。 */
const questionsSystemPrompt = (
  language?: string,
) => `You are a data analysis expert.${language ? ` Respond in ${language}.` : ""}

Given a dataset summary, suggest insightful questions that a user could ask to better understand their data. Focus on:
- Trends and patterns
- Comparisons and rankings
- Correlations between columns
- Outliers and anomalies
- Actionable business insights

Each question should be specific to the data columns available.`;

const QuestionsResponseSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().describe("The question to ask about the data"),
        category: z
          .enum(["trend", "comparison", "correlation", "anomaly", "insight"])
          .describe("Category of the question"),
      }),
    )
    .describe("5-8 suggested questions"),
});

export interface SuggestQuestionsOptions {
  model: ModelInput;
  data: TabularData;
  dataSummary?: string;
  language?: string;
  /** Number of questions to suggest (default: 6) */
  count?: number;
  temperature?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Retries done by the AI SDK on transient errors (SDK default: 2). Set 0 when you retry yourself. */
  maxRetries?: number;
}

export interface SuggestedQuestion {
  question: string;
  category: "trend" | "comparison" | "correlation" | "anomaly" | "insight";
}

/**
 * Suggest interesting questions a user could ask about their data.
 * Great for onboarding users who don't know where to start with their dataset.
 *
 * @example
 * ```ts
 * const questions = await suggestQuestions({
 *   model: { apiKey: "sk-...", model: "gpt-4o" },
 *   data: myData,
 * });
 *
 * questions.forEach(q => console.log(`[${q.category}] ${q.question}`));
 * // [trend] How has revenue changed over the last 6 months?
 * // [comparison] Which product category generates the most revenue?
 * // [correlation] Is there a relationship between price and quantity sold?
 * ```
 * 为当前表格生成可继续追问的问题。
 */
export async function suggestQuestions(
  options: SuggestQuestionsOptions,
): Promise<SuggestedQuestion[]> {
  const {
    data,
    language,
    count = 6,
    temperature = 0.7,
    signal,
    maxRetries,
  } = options;

  try {
    validateTabularData(data);
    const dataSummary = options.dataSummary ?? summarizeTabularData(data);
    const model = resolveModel(options.model);

    const { object } = await generateObject({
      model,
      schema: QuestionsResponseSchema,
      system: questionsSystemPrompt(language),
      prompt: `Here is the dataset to analyze:\n\n${dataSummary}\n\nSuggest ${count} insightful questions about this data.`,
      temperature,
      ...(signal && { abortSignal: signal }),
      ...(maxRetries !== undefined && { maxRetries }),
    });

    return object.questions.slice(0, count);
  } catch (error) {
    throw toAIError(error);
  }
}
