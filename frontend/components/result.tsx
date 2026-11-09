"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  Pin,
  ShieldAlert,
  ShieldCheck,
  Table2,
} from "lucide-react";
import type { ChartSpec, DashboardCard, DashboardCardCreatePayload, Result } from "@/lib/api";
import { AgentSteps } from "./agent-steps";
import { GraphView } from "./graph-view";
import { Markdown } from "./markdown";
import { WrittenAnalysis } from "./written-analysis";
import { useT } from "@/lib/i18n/client";

export function AnalysisResult({
  result,
  onPinCard,
  dashboardCards = [],
}: {
  result: Result;
  onPinCard?: (payload: DashboardCardCreatePayload) => void;
  dashboardCards?: DashboardCard[];
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.result;
  const graphT = dictionary.graph;
  const [showProofOfWork, setShowProofOfWork] = useState(false);

  const score = result.confidence_score ?? result.verification?.score ?? 95;
  const grade = result.confidence_grade ?? result.verification?.grade ?? (score >= 80 ? "high" : score >= 60 ? "medium" : "low");
  const assumptions = result.assumptions ?? result.verification?.assumptions ?? [];
  const caveats = result.caveats ?? result.verification?.caveats ?? [];
  const pow = result.verification?.proof_of_work;

  function handlePin(payload: DashboardCardCreatePayload) {
    if (!onPinCard) return;
    onPinCard(payload);
  }

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
    const zCol = nonNumCols[1] || null;
    const isDate = /date|time|month|year|day|week/i.test(xCol.key);
    return {
      title: result.answer ? result.answer.slice(0, 60) : "Data Visualization",
      chart_type: isDate ? "line" : "bar",
      description: "",
      x_key: xCol.key,
      y_keys: [yCol.key],
      z_key: zCol ? zCol.key : null,
      group_mode: "grouped",
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

  const chartTitle = activeChart?.title || result.answer?.slice(0, 80) || "Data Visualization";
  const chartQuery = result.sql || result.answer;
  const isChartPinned = useMemo(() => {
    return dashboardCards.some(
      (c) =>
        c.card_type === "chart" &&
        (c.title === chartTitle || (Boolean(c.query_text) && Boolean(chartQuery) && c.query_text === chartQuery))
    );
  }, [dashboardCards, chartTitle, chartQuery]);

  const tableTitle = result.answer ? result.answer.slice(0, 80) : "Query Results";
  const tableQuery = result.sql || result.answer;
  const isTablePinned = useMemo(() => {
    return dashboardCards.some(
      (c) =>
        (c.card_type === "table" || c.card_type === "metric") &&
        (c.title === tableTitle || (Boolean(c.query_text) && Boolean(tableQuery) && c.query_text === tableQuery))
    );
  }, [dashboardCards, tableTitle, tableQuery]);

  const reportTitle = result.report?.title || result.answer?.slice(0, 80) || "Written Analysis";
  const reportQuery = result.sql || result.answer;
  const isReportPinned = useMemo(() => {
    return dashboardCards.some(
      (c) =>
        c.card_type === "report" &&
        (c.title === reportTitle || (Boolean(c.query_text) && Boolean(reportQuery) && c.query_text === reportQuery))
    );
  }, [dashboardCards, reportTitle, reportQuery]);

  const isGeneralPinned = result.report ? isReportPinned : (activeChart ? isChartPinned : isTablePinned);

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
          <GraphView
            chart={activeChart}
            onPin={
              onPinCard
                ? () =>
                    handlePin({
                      title: chartTitle,
                      card_type: "chart",
                      content: activeChart,
                      query_text: chartQuery,
                    })
                : undefined
            }
            isPinned={isChartPinned}
          />
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
                {onPinCard && (
                  <Button
                    variant="ghost"
                    size="plain"
                    className={`pin-btn ${isTablePinned ? "active is-pinned" : ""}`}
                    onClick={() =>
                      handlePin({
                        title: tableTitle,
                        card_type: "table",
                        content: {
                          rows: result.rows || [],
                          columns: result.columns || [],
                          sql: result.sql,
                          answer: result.answer,
                        },
                        query_text: tableQuery,
                      })
                    }
                    title={isTablePinned ? t.unpinFromDashboard : t.pinToDashboard}
                  >
                    {isTablePinned ? <Check size={14} /> : <Pin size={14} />}
                    <span>{isTablePinned ? t.pinned : t.pinToDashboard}</span>
                  </Button>
                )}
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

          {result.status === "answered" && (
            <button
              type="button"
              className={`confidence-score-pill grade-${grade} ${showProofOfWork ? "expanded" : ""}`}
              onClick={() => setShowProofOfWork((v) => !v)}
              title="Click to view Proof of Work & Assumptions"
            >
              {grade === "high" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
              <span>{t.confidenceLabel(score)}</span>
              {showProofOfWork ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}

          {onPinCard && (
            <Button
              variant="ghost"
              size="plain"
              className={`pin-heading-btn ${isGeneralPinned ? "is-pinned" : ""}`}
              onClick={() => {
                if (result.report) {
                  handlePin({
                    title: reportTitle,
                    card_type: "report",
                    content: result.report,
                    query_text: reportQuery,
                  });
                } else if (activeChart) {
                  handlePin({
                    title: chartTitle,
                    card_type: "chart",
                    content: activeChart,
                    query_text: chartQuery,
                  });
                } else {
                  handlePin({
                    title: tableTitle,
                    card_type: result.rows?.length ? "table" : "metric",
                    content: {
                      rows: result.rows || [],
                      columns: result.columns || [],
                      sql: result.sql,
                      answer: result.answer,
                      value: result.answer,
                    },
                    query_text: tableQuery,
                  });
                }
              }}
              title={isGeneralPinned ? t.unpinFromDashboard : t.pinToDashboard}
            >
              {isGeneralPinned ? <Check size={13} /> : <Pin size={13} />}
              <span>{isGeneralPinned ? t.pinned : t.pinToDashboard}</span>
            </Button>
          )}
        </div>

        {showProofOfWork && (
          <div className="proof-of-work-card">
            <div className="pow-header">
              <div className="pow-title">
                <ShieldCheck size={16} className="text-primary" />
                <strong>{t.proofOfWorkTitle}</strong>
              </div>
              <span className={`pow-grade-badge grade-${grade}`}>
                {t.confidenceGrade[grade]} &bull; {score}%
              </span>
            </div>

            {assumptions.length > 0 && (
              <div className="pow-section">
                <span className="pow-section-label">{t.assumptionsTitle}</span>
                <ul className="pow-list assumptions-list">
                  {assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {caveats.length > 0 && (
              <div className="pow-section caveats-section">
                <span className="pow-section-label caveats-label">{t.caveatsTitle}</span>
                <ul className="pow-list caveats-list">
                  {caveats.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pow-checklist">
              <div className="pow-check-item">
                <Check size={13} className="text-emerald" />
                <span>{t.astValidated}</span>
              </div>
              <div className="pow-check-item">
                <Check size={13} className="text-emerald" />
                <span>{t.readOnlyEnforced}</span>
              </div>
              {pow?.tables_scanned && pow.tables_scanned.length > 0 && (
                <div className="pow-check-item">
                  <Check size={13} className="text-emerald" />
                  <span>
                    {t.tablesScanned(pow.tables_scanned.length)}:{" "}
                    <code>{pow.tables_scanned.join(", ")}</code>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {result.report ? (
          <WrittenAnalysis report={result.report} />
        ) : (
          <Markdown>{result.answer}</Markdown>
        )}
      </div>
    </article>
  );
}
