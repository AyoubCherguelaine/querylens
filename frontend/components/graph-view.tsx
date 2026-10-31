"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  ScatterChart,
  Filter,
  RotateCcw,
  Search,
  Check,
  Download,
  Database,
  FileSpreadsheet,
  Layers,
  ChevronDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  AreaChart as RechartsAreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ChartSpec } from "@/lib/api";
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
  "#14b8a6", // Teal
  "#f97316", // Orange
];

/** Formats numerical values cleanly with k's (thousands), M's (millions), or full decimals */
function formatKValue(val: number | string | undefined, intl?: string): string {
  if (val === undefined || val === null || val === "") return "";
  const num = typeof val === "number" ? val : parseFloat(String(val));
  if (isNaN(num)) return String(val);
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) {
    const formatted = (num / 1_000_000_000).toFixed(num % 1_000_000_000 === 0 ? 0 : 1);
    return `${formatted}B`;
  }
  if (abs >= 1_000_000) {
    const formatted = (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1);
    return `${formatted}M`;
  }
  if (abs >= 1_000) {
    const formatted = (num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1);
    return `${formatted}k`;
  }
  return typeof intl === "string" ? num.toLocaleString(intl) : num.toLocaleString();
}

type SortOption = "default" | "val_desc" | "val_asc" | "name_asc";
type GroupMode = "grouped" | "stacked";

export function GraphView({ chart }: { chart: ChartSpec }) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.graph;
  const gradientId = useId();

  // Next.js hydration safety for Recharts ResponsiveContainer
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // AI chart type choice initialized, user can override
  const [activeType, setActiveType] = useState<ChartSpec["chart_type"]>(
    chart.chart_type || "bar",
  );

  // 3rd Dimension (Breakdown) & Grouping Mode
  const [zKey, setZKey] = useState<string | null>(chart.z_key || null);
  const [groupMode, setGroupMode] = useState<GroupMode>(chart.group_mode || "grouped");

  // Filtering states
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [minY, setMinY] = useState<number>(0);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const rows = chart.rows || [];
  const columns = chart.columns || [];
  const xKey = chart.x_key;
  const yKeys = chart.y_keys?.length ? chart.y_keys : [columns[1]?.key || ""];
  const primaryYKey = yKeys[0] || "";

  // Available categorical columns that can serve as the 3rd Dimension (Breakdown)
  const candidateZColumns = useMemo(() => {
    return columns.filter(
      (c) => c.key !== xKey && !yKeys.includes(c.key),
    );
  }, [columns, xKey, yKeys]);

  // Extract raw data items
  const rawData = useMemo(() => {
    return rows.map((r, i) => {
      const rawX = r[xKey];
      const xVal = rawX !== null && rawX !== undefined ? String(rawX) : `Item ${i + 1}`;
      const rawY = r[primaryYKey];
      const numY = typeof rawY === "number" ? rawY : parseFloat(String(rawY)) || 0;
      const rawZ = zKey ? r[zKey] : null;
      const zVal = rawZ !== null && rawZ !== undefined ? String(rawZ) : null;
      return {
        id: `${i}-${xVal}`,
        index: i,
        x: xVal,
        y: numY,
        z: zVal,
        raw: r,
        color: PALETTE[i % PALETTE.length],
      };
    });
  }, [rows, xKey, primaryYKey, zKey]);

  // Distinct primary categories (X-axis)
  const allCategories = useMemo(() => {
    return Array.from(new Set(rawData.map((d) => d.x)));
  }, [rawData]);

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => {
    return new Set(allCategories);
  });

  // Default max X elements: 12 if total > 12, else total (per user constraint: max element in X is 12)
  const defaultMaxX = allCategories.length > 12 ? 12 : allCategories.length || 12;
  const [maxX, setMaxX] = useState<number>(defaultMaxX);

  // Maximum Y in dataset
  const rawMaxY = useMemo(() => {
    return Math.max(...rawData.map((d) => d.y), 0) || 100;
  }, [rawData]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (selectedCategories.size < allCategories.length) count++;
    if (minY > 0) count++;
    if (sortBy !== "default") count++;
    if (maxX !== defaultMaxX && maxX !== allCategories.length) count++;
    if (zKey !== (chart.z_key || null)) count++;
    if (groupMode !== (chart.group_mode || "grouped")) count++;
    return count;
  }, [searchQuery, selectedCategories, allCategories.length, minY, sortBy, maxX, defaultMaxX, zKey, chart.z_key, groupMode, chart.group_mode]);

  function resetFilters() {
    setSearchQuery("");
    setSelectedCategories(new Set(allCategories));
    setMinY(0);
    setSortBy("default");
    setMaxX(defaultMaxX);
    setZKey(chart.z_key || null);
    setGroupMode(chart.group_mode || "grouped");
  }

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  // Multi-dimensional pivoted data processing
  const { chartData, seriesKeys, has3D } = useMemo(() => {
    // 1. Filter raw rows
    const filteredRows = rawData.filter((d) => {
      if (selectedCategories.size > 0 && !selectedCategories.has(d.x)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!d.x.toLowerCase().includes(q) && !(d.z && d.z.toLowerCase().includes(q))) {
          return false;
        }
      }
      if (d.y < minY) {
        return false;
      }
      return true;
    });

    // 2. Multi-dimensional: if zKey is active (3rd dimension)
    if (zKey) {
      const seriesSet = new Set<string>();
      const groupedMap = new Map<string, Record<string, any>>();

      for (const item of filteredRows) {
        const seriesName = item.z || "Other";
        seriesSet.add(seriesName);

        if (!groupedMap.has(item.x)) {
          groupedMap.set(item.x, {
            x: item.x,
            _total: 0,
            _bubbleZ: typeof item.raw[zKey] === "number" ? item.raw[zKey] : 10,
          });
        }
        const record = groupedMap.get(item.x)!;
        record[seriesName] = (record[seriesName] || 0) + item.y;
        record._total += item.y;
      }

      let result = Array.from(groupedMap.values());

      if (sortBy === "val_desc") {
        result.sort((a, b) => (b._total || 0) - (a._total || 0));
      } else if (sortBy === "val_asc") {
        result.sort((a, b) => (a._total || 0) - (b._total || 0));
      } else if (sortBy === "name_asc") {
        result.sort((a, b) => a.x.localeCompare(b.x));
      }

      if (maxX > 0 && result.length > maxX) {
        result = result.slice(0, maxX);
      }

      return {
        chartData: result,
        seriesKeys: Array.from(seriesSet),
        has3D: true,
      };
    }

    // 3. Multi-metric 3D: if multiple yKeys are provided
    if (yKeys.length > 1) {
      let result = filteredRows.map((item) => {
        const entry: Record<string, any> = { x: item.x };
        let total = 0;
        for (const yk of yKeys) {
          const val = item.raw[yk];
          const num = typeof val === "number" ? val : parseFloat(String(val)) || 0;
          entry[yk] = num;
          total += num;
        }
        entry._total = total;
        return entry;
      });

      if (sortBy === "val_desc") {
        result.sort((a, b) => (b._total || 0) - (a._total || 0));
      } else if (sortBy === "val_asc") {
        result.sort((a, b) => (a._total || 0) - (b._total || 0));
      } else if (sortBy === "name_asc") {
        result.sort((a, b) => a.x.localeCompare(b.x));
      }

      if (maxX > 0 && result.length > maxX) {
        result = result.slice(0, maxX);
      }

      return {
        chartData: result,
        seriesKeys: yKeys,
        has3D: true,
      };
    }

    // 4. Standard 2D single metric
    let result = filteredRows.map((item) => ({
      x: item.x,
      [primaryYKey]: item.y,
      y: item.y,
      color: item.color,
    }));

    if (sortBy === "val_desc") {
      result.sort((a, b) => b.y - a.y);
    } else if (sortBy === "val_asc") {
      result.sort((a, b) => a.y - b.y);
    } else if (sortBy === "name_asc") {
      result.sort((a, b) => a.x.localeCompare(b.x));
    }

    if (maxX > 0 && result.length > maxX) {
      result = result.slice(0, maxX);
    }

    return {
      chartData: result,
      seriesKeys: [primaryYKey],
      has3D: false,
    };
  }, [rawData, selectedCategories, searchQuery, minY, zKey, yKeys, primaryYKey, sortBy, maxX]);

  function downloadCsv() {
    let content = chart.data_source?.csv_data;
    if (!content) {
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
      chart_type: activeType,
      x_axis: chart.x_label || chart.x_key,
      y_axis: chart.y_label || chart.y_keys.join(", "),
      z_axis: zKey,
      group_mode: groupMode,
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

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="recharts-custom-tooltip">
          <p className="tooltip-title">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="tooltip-row">
              <span className="tooltip-dot" style={{ background: entry.color || entry.fill }} />
              <span className="tooltip-name">{entry.name}:</span>
              <span className="tooltip-val">
                {entry.value?.toLocaleString(intl)}{" "}
                <small className="tooltip-k">({formatKValue(entry.value, intl)})</small>
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="graph-container">
      {/* Header with Title, Dimension Indicator, Chart Type Switcher, Filter Toggle, and Downloads */}
      <div className="graph-header">
        <div className="graph-title-group">
          <div className="graph-badge">
            <span className="dot" />
            <span className="graph-badge-text">
              {has3D ? t.dimensionsCount(3) : t.dimensionsCount(2)} &bull;{" "}
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

          {/* Filter Toggle Button with Badge */}
          <Button
            variant="ghost"
            size="plain"
            className={`graph-filter-btn ${isFiltersOpen ? "open" : ""} ${activeFiltersCount > 0 ? "has-filters" : ""}`}
            onClick={() => setIsFiltersOpen((v) => !v)}
            title={t.filters}
          >
            <Filter size={14} />
            <span>{t.filters}</span>
            {activeFiltersCount > 0 && (
              <span className="filter-count-badge">{activeFiltersCount}</span>
            )}
          </Button>

          {/* Download Data Source CSV */}
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

      {/* Expandable Filter Panel (Search, 3rd Dimension Breakdown, Grouping, Max X, Sort, Min Y) */}
      {isFiltersOpen && (
        <div className="graph-filter-panel">
          <div className="filter-panel-header">
            <span className="filter-status-text">
              {t.showingItems(chartData.length, allCategories.length)}
              {allCategories.length > 12 && maxX === 12 && (
                <> &bull; <strong>{t.showingCapped(chartData.length, allCategories.length)}</strong></>
              )}
              {has3D && (
                <> &bull; <span className="badge-3d-indicator">{t.thirdDimension}: {zKey || yKeys.join(", ")}</span></>
              )}
            </span>
            {activeFiltersCount > 0 && (
              <button type="button" className="reset-filters-btn" onClick={resetFilters}>
                <RotateCcw size={12} />
                <span>{t.resetFilters}</span>
              </button>
            )}
          </div>

          {/* Filter Row: Search, Max Items on X (12 cap), 3rd Dimension selector, Grouping, Sort, Min Y */}
          <div className="filter-row">
            {/* Search items */}
            <div className="filter-search-box">
              <Search size={13} className="text-muted" />
              <input
                type="text"
                placeholder={t.filterSearch}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* 3rd Dimension (Breakdown) Selector */}
            {candidateZColumns.length > 0 && (
              <div className="filter-group">
                <label>{t.thirdDimension}:</label>
                <select
                  className="filter-select"
                  value={zKey || ""}
                  onChange={(e) => setZKey(e.target.value || null)}
                >
                  <option value="">{t.noBreakdown}</option>
                  {candidateZColumns.map((col) => (
                    <option key={col.key} value={col.key}>
                      {col.label || col.key}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Grouping Mode for Multi-series (Grouped vs Stacked) */}
            {has3D && (activeType === "bar" || activeType === "area") && (
              <div className="filter-group">
                <label>{t.groupMode}:</label>
                <div className="chip-group">
                  <button
                    type="button"
                    className={`chip-btn ${groupMode === "grouped" ? "active" : ""}`}
                    onClick={() => setGroupMode("grouped")}
                  >
                    {t.grouped}
                  </button>
                  <button
                    type="button"
                    className={`chip-btn ${groupMode === "stacked" ? "active" : ""}`}
                    onClick={() => setGroupMode("stacked")}
                  >
                    {t.stacked}
                  </button>
                </div>
              </div>
            )}

            {/* Max Elements on X Axis (Default 12 cap) */}
            <div className="filter-group">
              <label>{t.maxElements}:</label>
              <div className="chip-group">
                {[5, 8, 10, 12].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`chip-btn ${maxX === num ? "active" : ""}`}
                    onClick={() => setMaxX(num)}
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  className={`chip-btn ${maxX >= allCategories.length ? "active" : ""}`}
                  onClick={() => setMaxX(allCategories.length || 100)}
                >
                  {t.allElements}
                </button>
              </div>
            </div>

            {/* Sort Order */}
            <div className="filter-group">
              <label>{t.sortBy}:</label>
              <select
                className="filter-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
              >
                <option value="default">{t.sortDefault}</option>
                <option value="val_desc">{t.sortDesc}</option>
                <option value="val_asc">{t.sortAsc}</option>
                <option value="name_asc">{t.sortName}</option>
              </select>
            </div>

            {/* Min Value (Y) Filter */}
            {rawMaxY > 0 && (
              <div className="filter-group">
                <label>{t.minYThreshold}:</label>
                <div className="filter-slider-wrap">
                  <input
                    type="range"
                    min={0}
                    max={rawMaxY * 0.9}
                    step={rawMaxY / 50 || 1}
                    value={minY}
                    onChange={(e) => setMinY(Number(e.target.value))}
                  />
                  <span className="filter-slider-val">{formatKValue(minY, intl)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Category Toggle Pills */}
          {allCategories.length > 1 && (
            <div className="category-pills-row">
              <button
                type="button"
                className="category-pill"
                onClick={() => setSelectedCategories(new Set(allCategories))}
              >
                {t.allElements}
              </button>
              <button
                type="button"
                className="category-pill"
                onClick={() => {
                  if (allCategories.length > 0) setSelectedCategories(new Set([allCategories[0]]));
                }}
              >
                {t.resetFilters}
              </button>
              {allCategories.map((cat, i) => {
                const isSelected = selectedCategories.has(cat);
                const color = PALETTE[i % PALETTE.length];
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`category-pill ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleCategory(cat)}
                  >
                    <span
                      className="pill-color-indicator"
                      style={{ background: isSelected ? color : "#94a3b8" }}
                    />
                    <span>{cat}</span>
                    {isSelected && <Check size={11} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Recharts Visualization Canvas */}
      <div className="graph-canvas-wrap" style={{ width: "100%", height: 360, minHeight: 340 }}>
        {!mounted ? (
          <div className="empty-graph-notice">Loading chart…</div>
        ) : !chartData.length ? (
          <div className="empty-graph-notice">{t.emptyGraph}</div>
        ) : activeType === "bar" ? (
          /* ================= BAR CHART ================= */
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 10, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#edf1f6" vertical={false} />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
                interval={0}
                tickFormatter={(val) => (String(val).length > 12 ? `${String(val).slice(0, 10)}…` : String(val))}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
                tickFormatter={(val) => formatKValue(val, intl)}
              />
              <Tooltip content={<CustomTooltip />} />
              {has3D && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />}
              {seriesKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={PALETTE[i % PALETTE.length]}
                  stackId={groupMode === "stacked" ? "stack" : undefined}
                  radius={groupMode === "stacked" ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                  name={key}
                >
                  {!has3D &&
                    chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                </Bar>
              ))}
            </RechartsBarChart>
          </ResponsiveContainer>
        ) : activeType === "line" ? (
          /* ================= LINE CHART ================= */
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 10, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#edf1f6" vertical={false} />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
                interval={0}
                tickFormatter={(val) => (String(val).length > 12 ? `${String(val).slice(0, 10)}…` : String(val))}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
                tickFormatter={(val) => formatKValue(val, intl)}
              />
              <Tooltip content={<CustomTooltip />} />
              {has3D && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />}
              {seriesKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#ffffff", stroke: PALETTE[i % PALETTE.length], strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                  name={key}
                />
              ))}
            </RechartsLineChart>
          </ResponsiveContainer>
        ) : activeType === "area" ? (
          /* ================= AREA CHART ================= */
          <ResponsiveContainer width="100%" height="100%">
            <RechartsAreaChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 10, bottom: 40 }}
            >
              <defs>
                {seriesKeys.map((key, i) => (
                  <linearGradient key={key} id={`colorArea-${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.65} />
                    <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#edf1f6" vertical={false} />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
                interval={0}
                tickFormatter={(val) => (String(val).length > 12 ? `${String(val).slice(0, 10)}…` : String(val))}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
                tickFormatter={(val) => formatKValue(val, intl)}
              />
              <Tooltip content={<CustomTooltip />} />
              {has3D && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />}
              {seriesKeys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#colorArea-${gradientId}-${i})`}
                  stackId={groupMode === "stacked" ? "stack" : undefined}
                  name={key}
                />
              ))}
            </RechartsAreaChart>
          </ResponsiveContainer>
        ) : activeType === "pie" ? (
          /* ================= PIE / DONUT CHART ================= */
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
              <Pie
                data={chartData}
                dataKey={seriesKeys[0]}
                nameKey="x"
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={115}
                paddingAngle={2}
                label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
            </RechartsPieChart>
          </ResponsiveContainer>
        ) : (
          /* ================= SCATTER / 3D BUBBLE CHART ================= */
          <ResponsiveContainer width="100%" height="100%">
            <RechartsScatterChart
              margin={{ top: 20, right: 30, left: 10, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#edf1f6" />
              <XAxis
                dataKey="x"
                name={chart.x_label || chart.x_key}
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
              />
              <YAxis
                dataKey={seriesKeys[0]}
                name={chart.y_label || seriesKeys[0]}
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#cbd5e1" }}
                tickFormatter={(val) => formatKValue(val, intl)}
              />
              {/* 3rd dimension scales bubble size */}
              <ZAxis
                dataKey="_bubbleZ"
                range={[80, 500]}
                name={zKey || "Size"}
              />
              <Tooltip content={<CustomTooltip />} />
              <Scatter
                name={chart.title}
                data={chartData}
                fill="#20a7c9"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Scatter>
            </RechartsScatterChart>
          </ResponsiveContainer>
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
            {t.rowsCount(chart.data_source?.row_count || rows.length)}
          </span>
          {chartData.length !== allCategories.length && (
            <span className="badge-numeric" style={{ marginLeft: 6, fontSize: 10 }}>
              {chartData.length} visible
            </span>
          )}
          {has3D && (
            <span className="badge-numeric" style={{ marginLeft: 6, fontSize: 10, background: "#e0f2fe", color: "#0369a1" }}>
              3 Dimensions active
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
