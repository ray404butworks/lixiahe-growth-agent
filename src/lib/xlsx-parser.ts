import { parseXLSX as parsePackageXLSX } from "csv-charts-ai/tabular";
import type { CSVData } from "./csv-parser";
/**
 * Check whether a file name indicates an Excel spreadsheet (.xlsx).
 * 按扩展名识别 Excel 工作簿，忽略扩展名大小写。
 */
export function isXLSXFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".xlsx");
}

/** Supported spreadsheet extensions for accept attributes and validation. */
export const SPREADSHEET_ACCEPT = ".csv,.xlsx";

/** 判断文件名是否属于支持的 CSV 或 XLSX 格式。 Check if a file is a supported format (CSV or XLSX). */
export function isSupportedFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".csv") || lower.endsWith(".xlsx");
}

/** 将指定 Excel 工作表读取成与 CSV 一致的表格结构，并保留额外列。 */
export async function parseXLSX(
  file: File,
  options: {
    hasHeader?: boolean;
    skipEmptyLines?: boolean;
    sheet?: string | number;
  } = {},
): Promise<CSVData> {
  return parsePackageXLSX(file, {
    hasHeader: options.hasHeader,
    skipEmpty: options.skipEmptyLines,
    sheet: options.sheet,
    preserveExtraColumns: true,
  });
}
