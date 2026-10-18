"use client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, Info } from "lucide-react";
import type { Result } from "@/lib/api";
import { AgentSteps } from "./agent-steps";
import { Markdown } from "./markdown";
import { WrittenAnalysis } from "./written-analysis";
import { useT } from "@/lib/i18n/client";

export function AnalysisResult({ result }: { result: Result }) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.result;
  function download() {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "analysis-evidence.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <article className="result">
      <AgentSteps steps={result.steps || []} />
      {!!result.rows?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {result.columns?.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {result.columns?.map((c) => (
                    <td key={c.key}>
                      {row[c.key] === null ? (
                        <span className="muted">NULL</span>
                      ) : (
                        String(row[c.key])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.truncated && <p className="notice">{t.truncated}</p>}
      {!!(result.sql || result.steps?.length) && (
        <>
          <div className="evidence">
            <details>
              <summary>{result.sql ? t.inspectQuery : t.inspectAgent}</summary>
              {result.sql && (
                <>
                  <pre>{result.sql}</pre>
                  <p>{t.parameters}</p>
                  <pre>{JSON.stringify(result.parameters, null, 2)}</pre>
                </>
              )}
              {result.error && (
                <pre>{JSON.stringify(result.error, null, 2)}</pre>
              )}
              <p>
                {result.sql ? t.executed : t.finished}{" "}
                {result.executed_at
                  ? new Date(result.executed_at).toLocaleString(intl)
                  : ""}
              </p>
              <pre>{JSON.stringify(result.plan, null, 2)}</pre>
              {result.warnings?.map((w) => (
                <p className="muted" key={w} dir="auto">
                  {w}
                </p>
              ))}
            </details>
            <Button
              variant="ghost"
              size="plain"
              className="icon-button"
              onClick={download}
              aria-label={t.download}
            >
              <Download size={17} />
            </Button>
          </div>
        </>
      )}
      <div className="assistant-answer">
        <div className="result-heading">
          {result.status === "answered" ? (
            <CheckCircle2 size={16} />
          ) : (
            <Info size={16} />
          )}
          <span>
            {result.status === "answered"
              ? t.answer
              : result.status === "clarification"
                ? t.clarification
                : t.stopped}
          </span>
          {result.duration_ms !== undefined && (
            <small>{t.ms(result.duration_ms)}</small>
          )}
        </div>
        {result.report ? (
          <WrittenAnalysis report={result.report} />
        ) : (
          <Markdown>{result.answer}</Markdown>
        )}
      </div>
    </article>
  );
}
