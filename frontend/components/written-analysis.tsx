"use client";
import { Download } from "lucide-react";
import type { WrittenReport } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function WrittenAnalysis({ report }: { report: WrittenReport }) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.report;
  function download() {
    const sources = report.evidence.map((item, index) =>
      `${t.query(index + 1)}${item.executed_at ? ` (${item.executed_at})` : ""}\n${item.sql}`,
    );
    const text = [
      report.title,
      report.summary,
      ...report.sections.map((section) => `${section.heading}\n\n${section.text}`),
      `${t.supportingQueries}\n\n${sources.join("\n\n")}`,
    ].join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "written-analysis.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="written-analysis" aria-label={t.label}>
      <div className="written-analysis-heading">
        <span>{t.label}</span>
        <button className="icon-button" onClick={download} aria-label={t.downloadLabel}>
          <Download size={16} /> {t.download}
        </button>
      </div>
      <h2 dir="auto">{report.title}</h2>
      <p className="analysis-summary" dir="auto">{report.summary}</p>
      {report.sections.map((section, index) => (
        <section key={index}>
          <h3 dir="auto">{section.heading}</h3>
          {section.text.split(/\n\s*\n/).map((paragraph, i) => <p key={i} dir="auto">{paragraph}</p>)}
        </section>
      ))}
      <details className="analysis-sources">
        <summary>{t.basedOn(report.evidence.length)}</summary>
        {report.evidence.map((item, index) => (
          <div key={item.id}>
            <p>{t.query(index + 1)}{item.executed_at ? ` · ${new Date(item.executed_at).toLocaleString(intl)}` : ""}</p>
            {item.sample_only && <p className="notice">{t.sample}</p>}
            {item.truncated && <p className="notice">{t.truncated}</p>}
            {item.cells_truncated && <p className="notice">{t.clipped}</p>}
            <pre>{item.sql}</pre>
          </div>
        ))}
      </details>
    </section>
  );
}
