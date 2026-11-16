import Papa, { type ParseResult } from "papaparse";
import {
  inferValuesType,
  inferColumnValuesType,
  detectCSVDelimiter,
  uniqueHeaders,
} from "csv-charts-ai/tabular";

export interface CSVColumn {
  name: string;
  type: "string" | "number" | "date" | "boolean";
  index: number;
}

export interface CSVData {
  headers: string[];
  rows: string[][];
  columns: CSVColumn[];
  rowCount: number;
}

export interface CSVSettings {
  delimiter: string;
  hasHeader: boolean;
  encoding: string;
  skipEmptyLines: boolean;
}

export const DEFAULT_CSV_SETTINGS: CSVSettings = {
  delimiter: "",
  hasHeader: true,
  encoding: "UTF-8",
  skipEmptyLines: true,
};

export const inferColumnType = inferValuesType;

/** 解析 CSV 并返回影响导入判断的列数和引号异常。 */
export const parseCSVWithDiagnostics = (
  content: string,
  settings: CSVSettings = DEFAULT_CSV_SETTINGS,
): { data: CSVData; warnings: string[] } => {
  const delimiter = settings.delimiter || detectCSVDelimiter(content);

  const result: ParseResult<string[]> = Papa.parse<string[]>(content, {
    delimiter,
    skipEmptyLines: settings.skipEmptyLines ? "greedy" : false,
  });

  // An unclosed quote breaks every following row; a stray quote Papa recovered from does not
  const fatal = result.errors.find((error) => error.code === "MissingQuotes");
  if (fatal) throw new Error(fatal.message);
  const recovered = result.errors.filter(
    (error) => error.code === "InvalidQuotes",
  );
  const allRows: string[][] = content.trim() ? result.data : [];
  // The newline ending the file is not an empty data row
  const last = allRows[allRows.length - 1];
  if (
    !settings.skipEmptyLines &&
    /[\r\n]$/.test(content) &&
    last?.length === 1 &&
    last[0] === ""
  )
    allRows.pop();

  if (allRows.length === 0) {
    return {
      data: { headers: [], rows: [], columns: [], rowCount: 0 },
      warnings: [],
    };
  }

  const firstRow = [...(allRows[0] ?? [])];
  const width = allRows.reduce(
    (max, row) => Math.max(max, row.length),
    firstRow.length,
  );
  while (firstRow.length < width) firstRow.push("");
  const headers: string[] = settings.hasHeader
    ? uniqueHeaders(firstRow)
    : firstRow.map((_: string, i: number) => `Column ${i + 1}`);

  const rawDataRows = settings.hasHeader ? allRows.slice(1) : allRows;
  const warnings: string[] = [];
  const quoteRows = [...new Set(recovered.map((error) => error.row ?? 0))];
  if (quoteRows.length)
    warnings.push(
      `Misplaced quotes on ${quoteRows.length} row${quoteRows.length === 1 ? "" : "s"} (first: row ${quoteRows[0]! + 1}) were read as-is. Check the delimiter and quote settings.`,
    );
  if (
    settings.hasHeader &&
    headers.some((h, i) => h !== (firstRow[i] ?? "").trim())
  )
    warnings.push(
      "Repeated or empty headers were renamed to keep columns distinct.",
    );
  const irregular = rawDataRows.filter(
    (row) => row.length !== (allRows[0]?.length ?? 0),
  ).length;
  if (irregular)
    warnings.push(
      `${irregular} rows have a different width from the first row. Missing cells were filled; extra columns were preserved.`,
    );
  const dataRows = rawDataRows.map((row) =>
    headers.map((_, i) => row[i] ?? ""),
  );

  const columns: CSVColumn[] = headers.map((name, index) => ({
    name,
    type: inferColumnValuesType(dataRows, index),
    index,
  }));

  return {
    data: { headers, rows: dataRows, columns, rowCount: dataRows.length },
    warnings,
  };
};

/**
 * Decode file bytes. A byte order mark wins over the chosen encoding, so
 * UTF-16 exports (Excel "Unicode text") open correctly.
 * 按所选编码解码文件内容，保留对不同销售表编码的支持。
 */
export function decodeText(buffer: ArrayBuffer, encoding: string): string {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 3));
  const bom =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
          ? "utf-8"
          : null;
  return new TextDecoder(bom ?? encoding).decode(buffer);
}

/** 将 CSV 文本读取为适用于字段映射的表格数据。 */
export const parseCSV = (
  content: string,
  settings: CSVSettings = DEFAULT_CSV_SETTINGS,
): CSVData => parseCSVWithDiagnostics(content, settings).data;
