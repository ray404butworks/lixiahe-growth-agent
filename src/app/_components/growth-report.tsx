"use client";

import { Download, Printer } from "lucide-react";
import { downloadBlob } from "~/lib/download";
import {
  buildReport,
  reportCsv,
  reportHtml,
  reportMarkdown,
  type ReportSource,
} from "~/lib/growth/report";
import "~/styles/report.css";

export function GrowthReportView({
  source,
  onImport,
  onDiagnose,
}: {
  source: ReportSource | null;
  onImport: () => void;
  onDiagnose: () => void;
}) {
  if (!source?.snapshot.totals.line_count)
    return (
      <section className="panel empty-state">
        <h2>先导入数据，再生成经营报告</h2>
        <p>报告使用当前看板的日期与渠道筛选。请导入数据或调整空的筛选范围。</p>
        <button className="button primary" onClick={onImport}>
          去导入数据
        </button>
      </section>
    );

  const report = buildReport(source);
  function exportFile(extension: string, body: string, type: string) {
    downloadBlob(new Blob([body], { type }), `${report.filename}.${extension}`);
  }

  return (
    <div className="growth-report">
      <div className="report-toolbar panel" aria-label="报告操作">
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={16} /> 打印 / 保存 PDF
        </button>
        <button
          className="button secondary"
          onClick={() =>
            exportFile(
              "md",
              reportMarkdown(report),
              "text/markdown;charset=utf-8",
            )
          }
        >
          <Download size={16} /> 下载 Markdown
        </button>
        <button
          className="button secondary"
          onClick={() =>
            exportFile("html", reportHtml(report), "text/html;charset=utf-8")
          }
        >
          <Download size={16} /> 下载 HTML
        </button>
        <button
          className="button secondary"
          onClick={() =>
            exportFile("csv", reportCsv(report), "text/csv;charset=utf-8")
          }
        >
          <Download size={16} /> 下载 CSV 汇总
        </button>
        <button className="button secondary" onClick={onDiagnose}>
          返回经营诊断
        </button>
      </div>
      <article className="report-document panel" aria-labelledby="report-title">
        <header>
          <p className="eyebrow">LIXIAHE · BUSINESS REVIEW</p>
          <h2 id="report-title">{report.title}</h2>
          <p>{report.subtitle}</p>
        </header>
        {report.sections.map(({ title, paragraphs, table }, sectionIndex) => (
          <section key={sectionIndex}>
            <h3>{title}</h3>
            {paragraphs?.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            {table && (
              <div className="table-scroll">
                <table aria-label={title}>
                  <thead>
                    <tr>
                      {table.headers.map((name) => (
                        <th key={name} scope="col">
                          {name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((cell, column) => (
                          <td key={column}>{cell ?? "数据不足"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
