"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BarChart3, CheckCircle2, Download, Info, Table2 } from "lucide-react";
import type { ChartSpec, Result } from "@/lib/api";
import { AgentSteps } from "./agent-steps";
import { GraphView } from "./graph-view";
import { Markdown } from "./markdown";
import { WrittenAnalysis } from "./written-analysis";
import { useT } from "@/lib/i18n/client";

export function AnalysisResult({ result }: { result: Result }) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.result;
  const graphT = dictionary.graph;

  const autoChart: ChartSpec | null = useMemo(() => {
    if (result.chart) return result.chart;
    if (
      !result.rows ||
      result.rows.length < 2 ||
      !result.columns ||
      result.columns.length < 2
    )
      return null;
    const cols = result.columns;
    const firstRow = result.rows[0];
    const numCols = cols.filter((c) => {
      const val = firstRow[c.key];
      return (
        typeof val === "number" ||
        (!isNaN(Number(val)) && val !== null && val !== "")
      );
    });
    if (!numCols.length) return null;
    const nonNumCols = cols.filter(
      (c) => !numCols.some((nc) => nc.key === c.key),
    );
    const xCol = nonNumCols[0] || cols[0];
    const yCol = numCols.find((nc) => nc.key !== xCol.key) || numCols[0];
    return {
      title: result.answer ? result.answer.slice(0, 60) : "Data Visualization",
      chart_type: "bar",
      description: "",
      x_key: xCol.key,
      y_keys: [yCol.key],
      x_label: xCol.label,
      y_label: yCol.label,
      evidence_id: "direct",
      sql: result.sql,
      rows: result.rows,
      columns: cols,
      data_source: {
        name: "Query Results",
        sql: result.sql,
        row_count: result.rows.length,
        download_name: "query_results_data_source.csv",
        columns: cols,
        rows: result.rows,
      },
    };
  }, [result]);

  const activeChart = result.chart || autoChart;
  const [displayMode, setDisplayMode] = useState<"graph" | "table">(
    result.chart ? "graph" : "table",
  );

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

      {/* Graph and Table Display */}
      {activeChart && displayMode === "graph" ? (
        <div className="result-graph-section">
          {!!result.rows?.length && (
            <div className="result-view-toggle">
              <Button
                variant="ghost"
                size="plain"
                className="active"
                onClick={() => setDisplayMode("graph")}
              >
                <BarChart3 size={14} /> {graphT.viewGraph}
              </Button>
              <Button
                variant="ghost"
                size="plain"
                onClick={() => setDisplayMode("table")}
              >
                <Table2 size={14} /> {graphT.viewTable}
              </Button>
            </div>
          )}
          <GraphView chart={activeChart} />
        </div>
      ) : (
        !!result.rows?.length && (
          <div className="result-table-section">
            {activeChart && (
              <div className="result-view-toggle">
                <Button
                  variant="ghost"
                  size="plain"
                  onClick={() => setDisplayMode("graph")}
                >
                  <BarChart3 size={14} /> {graphT.viewGraph}
                </Button>
                <Button
                  variant="ghost"
                  size="plain"
                  className="active"
                  onClick={() => setDisplayMode("table")}
                >
                  <Table2 size={14} /> {graphT.viewTable}
                </Button>
              </div>
            )}
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
          </div>
        )
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
