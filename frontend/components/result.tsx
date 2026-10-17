import { CheckCircle2, Download, Info } from "lucide-react";
import type { Result } from "@/lib/api";
import { AgentSteps } from "./agent-steps";
import { WrittenAnalysis } from "./written-analysis";

export function AnalysisResult({ result }: { result: Result }) {
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
      <div className="result-heading">
        {result.status === "answered" ? (
          <CheckCircle2 size={16} />
        ) : (
          <Info size={16} />
        )}
        <span>
          {result.status === "answered"
            ? "Answer"
            : result.status === "clarification" ? "A little more context" : "Agent stopped"}
        </span>
        {result.duration_ms !== undefined && (
          <small>{result.duration_ms} ms</small>
        )}
      </div>
      {result.report ? <WrittenAnalysis report={result.report} /> : <p>{result.answer}</p>}
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
      {result.truncated && (
        <p className="notice">
          Result limit reached. Narrow your filters to see a complete result.
        </p>
      )}
      {(result.sql || result.steps?.length) && (
        <>
          <div className="evidence">
            <details>
              <summary>{result.sql ? "Inspect query & evidence" : "Inspect agent details"}</summary>
              {result.sql && <>
                <pre>{result.sql}</pre>
                <p>Parameters</p>
                <pre>{JSON.stringify(result.parameters, null, 2)}</pre>
              </>}
              {result.error && <pre>{JSON.stringify(result.error, null, 2)}</pre>}
              <p>
                {result.sql ? "Executed" : "Finished"}{" "}
                {result.executed_at
                  ? new Date(result.executed_at).toLocaleString()
                  : ""}
              </p>
              <pre>{JSON.stringify(result.plan, null, 2)}</pre>
              {result.warnings?.map((w) => (
                <p className="muted" key={w}>
                  {w}
                </p>
              ))}
            </details>
            <button
              className="icon-button"
              onClick={download}
              aria-label="Download analysis evidence"
            >
              <Download size={17} />
            </button>
          </div>
        </>
      )}
    </article>
  );
}
