import { Download } from "lucide-react";
import type { WrittenReport } from "@/lib/api";

export function WrittenAnalysis({ report }: { report: WrittenReport }) {
  function download() {
    const sources = report.evidence.map((item, index) =>
      `Query ${index + 1}${item.executed_at ? ` (${item.executed_at})` : ""}\n${item.sql}`,
    );
    const text = [
      report.title,
      report.summary,
      ...report.sections.map((section) => `${section.heading}\n\n${section.text}`),
      `Supporting queries\n\n${sources.join("\n\n")}`,
    ].join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "written-analysis.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="written-analysis" aria-label="Written analysis">
      <div className="written-analysis-heading">
        <span>Written analysis</span>
        <button className="icon-button" onClick={download} aria-label="Download written analysis as text">
          <Download size={16} /> Download text
        </button>
      </div>
      <h2>{report.title}</h2>
      <p className="analysis-summary">{report.summary}</p>
      {report.sections.map((section, index) => (
        <section key={index}>
          <h3>{section.heading}</h3>
          {section.text.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        </section>
      ))}
      <details className="analysis-sources">
        <summary>Based on {report.evidence.length} supporting {report.evidence.length === 1 ? "query" : "queries"}</summary>
        {report.evidence.map((item, index) => (
          <div key={item.id}>
            <p>Query {index + 1}{item.executed_at ? ` · ${new Date(item.executed_at).toLocaleString()}` : ""}</p>
            {item.sample_only && <p className="notice">This evidence is a table sample.</p>}
            {item.truncated && <p className="notice">This query returned a limited result.</p>}
            {item.cells_truncated && <p className="notice">Long values were clipped in this query.</p>}
            <pre>{item.sql}</pre>
          </div>
        ))}
      </details>
    </section>
  );
}
