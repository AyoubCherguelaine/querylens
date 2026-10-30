"use client";

import { useId, useState } from "react";
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  ScatterChart,
  Download,
  Database,
  FileSpreadsheet,
  Check,
  ChevronDown,
  Info,
} from "lucide-react";
import type { ChartSpec, ChartSource } from "@/lib/api";
import { Button } from "./ui/button";
import { useT } from "@/lib/i18n/client";

const PALETTE = [
  "#20a7c9", // Superset Teal
  "#36b37e", // Emerald
  "#fbb334", // Amber
  "#6366f1", // Indigo
  "#e04355", // Coral
  "#0ea5e9", // Sky
  "#8b5cf6", // Violet
  "#ec4899", // Pink
];

export function GraphView({ chart }: { chart: ChartSpec }) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.graph;
  const gradientId = useId();

  const [activeType, setActiveType] = useState<ChartSpec["chart_type"]>(
    chart.chart_type || "bar",
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const rows = chart.rows || [];
  const xKey = chart.x_key;
  const yKey = chart.y_keys?.[0] || chart.columns?.[1]?.key || "";

  // Extract data items
  const data = rows.map((r, i) => {
    const rawX = r[xKey];
    const xVal =
      rawX !== null && rawX !== undefined ? String(rawX) : `Item ${i + 1}`;
    const rawY = r[yKey];
    const numY = typeof rawY === "number" ? rawY : parseFloat(String(rawY)) || 0;
    return {
      index: i,
      x: xVal,
      y: numY,
      raw: r,
    };
  });

  const maxY = Math.max(...data.map((d) => d.y), 0) || 1;
  const totalY = data.reduce((acc, d) => acc + Math.max(0, d.y), 0) || 1;

  function downloadCsv() {
    let content = chart.data_source?.csv_data;
    if (!content) {
      // Fallback CSV generation
      const cols = chart.columns || [];
      const keys = cols.length ? cols.map((c) => c.key) : Object.keys(rows[0] || {});
      const headers = cols.length ? cols.map((c) => c.label) : keys;
      const headerLine = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(",");
      const rowLines = rows.map((row) =>
        keys
          .map((k) => {
            const val = row[k] ?? "";
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(","),
      );
      content = `# Data Source: ${chart.title}\n# SQL: ${chart.sql || ""}\n${[headerLine, ...rowLines].join("\n")}`;
    }

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = chart.data_source?.download_name || "chart_data_source.csv";
    link.click();
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  }

  function downloadJson() {
    const payload = {
      title: chart.title,
      description: chart.description,
      sql: chart.sql,
      x_axis: chart.x_label || chart.x_key,
      y_axis: chart.y_label || chart.y_keys.join(", "),
      row_count: rows.length,
      columns: chart.columns,
      data: rows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${chart.data_source?.download_name?.replace(/\.csv$/, "") || "chart_data"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Chart dimensions
  const width = 720;
  const height = 340;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 35;
  const padBottom = 60;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  // Y Axis ticks (4 intervals)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    val: maxY * pct,
    y: padTop + plotHeight - pct * plotHeight,
  }));

  return (
    <div className="graph-container">
      {/* Header with Title, Chart Type Switcher, and Download Data Source */}
      <div className="graph-header">
        <div className="graph-title-group">
          <div className="graph-badge">
            <span className="dot" />
            <span className="graph-badge-text">
              {activeType === "bar"
                ? t.barChart
                : activeType === "line"
                  ? t.lineChart
                  : activeType === "area"
                    ? t.areaChart
                    : activeType === "pie"
                      ? t.pieChart
                      : t.scatterPlot}
            </span>
          </div>
          <h3>{chart.title}</h3>
          {chart.description && (
            <p className="graph-description">{chart.description}</p>
          )}
        </div>

        <div className="graph-actions">
          {/* Chart Type Switcher */}
          <div className="chart-type-tabs" role="tablist">
            <Button
              variant="ghost"
              size="plain"
              className={activeType === "bar" ? "active" : ""}
              title={t.barChart}
              onClick={() => setActiveType("bar")}
            >
              <BarChart3 size={15} />
            </Button>
            <Button
              variant="ghost"
              size="plain"
              className={activeType === "line" ? "active" : ""}
              title={t.lineChart}
              onClick={() => setActiveType("line")}
            >
              <LineChart size={15} />
            </Button>
            <Button
              variant="ghost"
              size="plain"
              className={activeType === "area" ? "active" : ""}
              title={t.areaChart}
              onClick={() => setActiveType("area")}
            >
              <AreaChart size={15} />
            </Button>
            <Button
              variant="ghost"
              size="plain"
              className={activeType === "pie" ? "active" : ""}
              title={t.pieChart}
              onClick={() => setActiveType("pie")}
            >
              <PieChart size={15} />
            </Button>
            <Button
              variant="ghost"
              size="plain"
              className={activeType === "scatter" ? "active" : ""}
              title={t.scatterPlot}
              onClick={() => setActiveType("scatter")}
            >
              <ScatterChart size={15} />
            </Button>
          </div>

          {/* Prominent Download Data Source Button */}
          <Button
            variant="ghost"
            size="plain"
            className={`download-source-btn ${downloadSuccess ? "success" : ""}`}
            onClick={downloadCsv}
            title={t.downloadSourceLabel}
          >
            {downloadSuccess ? (
              <>
                <Check size={14} />
                <span>Downloaded</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>{t.downloadDataSource}</span>
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="plain"
            className="icon-button download-json-btn"
            onClick={downloadJson}
            title={t.downloadJson}
          >
            <FileSpreadsheet size={15} />
          </Button>
        </div>
      </div>

      {/* Main SVG Visualization */}
      <div className="graph-canvas-wrap">
        {!data.length ? (
          <div className="empty-graph-notice">{t.emptyGraph}</div>
        ) : activeType === "pie" ? (
          <PieChartView
            data={data}
            totalY={totalY}
            hoveredIndex={hoveredIndex}
            setHoveredIndex={setHoveredIndex}
            intl={intl}
          />
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="graph-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient
                id={`area-grad-${gradientId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#20a7c9" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#20a7c9" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {yTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={tick.y}
                  x2={width - padRight}
                  y2={tick.y}
                  className="graph-grid-line"
                />
                <text
                  x={padLeft - 10}
                  y={tick.y + 4}
                  className="graph-tick-label"
                  textAnchor="end"
                >
                  {tick.val >= 1000000
                    ? `${(tick.val / 1000000).toFixed(1)}M`
                    : tick.val >= 1000
                      ? `${(tick.val / 1000).toFixed(1)}k`
                      : tick.val.toLocaleString(intl)}
                </text>
              </g>
            ))}

            {/* Y Axis Label */}
            {chart.y_label && (
              <text
                x={18}
                y={padTop - 12}
                className="graph-axis-title"
                textAnchor="start"
              >
                {chart.y_label}
              </text>
            )}

            {/* BAR CHART */}
            {activeType === "bar" && (
              <g className="graph-bars">
                {data.map((d, i) => {
                  const barWidth = Math.max(
                    8,
                    Math.min(48, (plotWidth / data.length) * 0.65),
                  );
                  const stepX = plotWidth / data.length;
                  const x = padLeft + i * stepX + (stepX - barWidth) / 2;
                  const barHeight = (d.y / maxY) * plotHeight;
                  const y = padTop + plotHeight - barHeight;
                  const isHovered = hoveredIndex === i;
                  const color = PALETTE[i % PALETTE.length];

                  return (
                    <g
                      key={i}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className="graph-bar-group"
                    >
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={Math.max(2, barHeight)}
                        rx={3}
                        ry={3}
                        fill={color}
                        opacity={isHovered ? 1 : 0.88}
                        className="graph-bar-rect"
                      />
                      {/* Top value badge on hover */}
                      {isHovered && (
                        <text
                          x={x + barWidth / 2}
                          y={y - 6}
                          className="graph-hover-val"
                          textAnchor="middle"
                        >
                          {d.y.toLocaleString(intl)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* LINE OR AREA CHART */}
            {(activeType === "line" || activeType === "area") && (
              <g className="graph-line-group">
                {(() => {
                  const stepX = plotWidth / Math.max(1, data.length - 1);
                  const points = data.map((d, i) => {
                    const x = padLeft + i * stepX;
                    const y = padTop + plotHeight - (d.y / maxY) * plotHeight;
                    return { x, y, d };
                  });

                  const linePath = points
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                    .join(" ");

                  const areaPath = `${linePath} L ${padLeft + (data.length - 1) * stepX} ${padTop + plotHeight} L ${padLeft} ${padTop + plotHeight} Z`;

                  return (
                    <>
                      {activeType === "area" && (
                        <path
                          d={areaPath}
                          fill={`url(#area-grad-${gradientId})`}
                          className="graph-area-fill"
                        />
                      )}
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#20a7c9"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="graph-line-stroke"
                      />
                      {points.map((p, i) => {
                        const isHovered = hoveredIndex === i;
                        return (
                          <g
                            key={i}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          >
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? 6 : 4}
                              fill="#ffffff"
                              stroke="#20a7c9"
                              strokeWidth={isHovered ? 3 : 2}
                              className="graph-dot"
                            />
                            {isHovered && (
                              <text
                                x={p.x}
                                y={p.y - 10}
                                className="graph-hover-val"
                                textAnchor="middle"
                              >
                                {p.d.y.toLocaleString(intl)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </g>
            )}

            {/* SCATTER PLOT */}
            {activeType === "scatter" && (
              <g className="graph-scatter-group">
                {(() => {
                  const stepX = plotWidth / Math.max(1, data.length - 1);
                  return data.map((d, i) => {
                    const x = padLeft + i * stepX;
                    const y = padTop + plotHeight - (d.y / maxY) * plotHeight;
                    const isHovered = hoveredIndex === i;
                    const color = PALETTE[i % PALETTE.length];
                    return (
                      <g
                        key={i}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        <circle
                          cx={x}
                          cy={y}
                          r={isHovered ? 8 : 5}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={2}
                          className="graph-dot"
                        />
                        {isHovered && (
                          <text
                            x={x}
                            y={y - 12}
                            className="graph-hover-val"
                            textAnchor="middle"
                          >
                            {d.y.toLocaleString(intl)}
                          </text>
                        )}
                      </g>
                    );
                  });
                })()}
              </g>
            )}

            {/* X Axis Labels */}
            <g className="graph-x-labels">
              {data.map((d, i) => {
                const stepX =
                  activeType === "bar"
                    ? plotWidth / data.length
                    : plotWidth / Math.max(1, data.length - 1);
                const x =
                  activeType === "bar"
                    ? padLeft + i * stepX + stepX / 2
                    : padLeft + i * stepX;
                const isHovered = hoveredIndex === i;

                // Truncate label if too long
                const label = d.x.length > 12 ? `${d.x.slice(0, 10)}…` : d.x;

                return (
                  <text
                    key={i}
                    x={x}
                    y={height - padBottom + 20}
                    className={`graph-x-label ${isHovered ? "active" : ""}`}
                    textAnchor="middle"
                  >
                    <title>{d.x}</title>
                    {label}
                  </text>
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {/* Special Data Source Info Footer */}
      <div className="graph-footer">
        <div className="graph-datasource-pill">
          <Database size={13} />
          <span>
            {t.dataSourceBadge}: <strong>{chart.data_source?.name || chart.title}</strong>
          </span>
          <span className="pill-dot" />
          <span className="row-count">
            {t.rowsCount(chart.data_source?.row_count || data.length)}
          </span>
        </div>

        {hoveredIndex !== null && data[hoveredIndex] && (
          <div className="graph-live-tooltip">
            <strong>{data[hoveredIndex].x}:</strong>{" "}
            <span>{data[hoveredIndex].y.toLocaleString(intl)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Pie / Donut Chart visualization */
function PieChartView({
  data,
  totalY,
  hoveredIndex,
  setHoveredIndex,
  intl,
}: {
  data: { index: number; x: string; y: number }[];
  totalY: number;
  hoveredIndex: number | null;
  setHoveredIndex: (idx: number | null) => void;
  intl: string;
}) {
  const size = 300;
  const center = size / 2;
  const radius = 110;
  const innerRadius = 60; // Donut style

  let accumulatedAngle = 0;
  const slices = data.map((d, i) => {
    const fraction = totalY > 0 ? d.y / totalY : 0;
    const angle = fraction * 2 * Math.PI;
    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + angle;
    accumulatedAngle += angle;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    const ix1 = center + innerRadius * Math.cos(endAngle);
    const iy1 = center + innerRadius * Math.sin(endAngle);
    const ix2 = center + innerRadius * Math.cos(startAngle);
    const iy2 = center + innerRadius * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

    return {
      ...d,
      path,
      fraction,
      percentage: Math.round(fraction * 100),
      color: PALETTE[i % PALETTE.length],
    };
  });

  return (
    <div className="pie-chart-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="pie-svg">
        {slices.map((slice, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <path
              key={i}
              d={slice.path}
              fill={slice.color}
              opacity={isHovered ? 1 : 0.88}
              stroke="#ffffff"
              strokeWidth={2}
              className="pie-slice"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          );
        })}
        {/* Center label */}
        <text
          x={center}
          y={center - 4}
          className="pie-center-title"
          textAnchor="middle"
        >
          {hoveredIndex !== null ? slices[hoveredIndex]?.percentage + "%" : "Total"}
        </text>
        <text
          x={center}
          y={center + 14}
          className="pie-center-val"
          textAnchor="middle"
        >
          {hoveredIndex !== null
            ? slices[hoveredIndex]?.x.slice(0, 10)
            : totalY.toLocaleString(intl)}
        </text>
      </svg>

      {/* Legend */}
      <div className="pie-legend">
        {slices.map((slice, i) => (
          <div
            key={i}
            className={`pie-legend-item ${hoveredIndex === i ? "active" : ""}`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span
              className="legend-color-dot"
              style={{ background: slice.color }}
            />
            <span className="legend-label" title={slice.x}>
              {slice.x}
            </span>
            <span className="legend-pct">{slice.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
