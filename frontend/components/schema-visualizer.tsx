"use client";
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Database,
  Table2,
  Search,
  Key,
  Link2,
  Code2,
  Sparkles,
  Check,
  Copy,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Info,
} from "lucide-react";
import type { Cube, Source, SourceOverview } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function SchemaVisualizer({
  overview,
  cubes,
  selectedCubeId,
  selectedSourceId,
  onSelectTable,
  onSelectSource,
  onAskAboutTable,
  onProfileTable,
}: {
  overview: SourceOverview;
  cubes: Cube[];
  selectedCubeId: string;
  selectedSourceId: string;
  onSelectTable: (id: string) => void;
  onSelectSource: (id: string) => void;
  onAskAboutTable: (cube: Cube) => void;
  onProfileTable: () => void;
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.schemaViewer;
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"map" | "details" | "ddl">("map");
  const [copiedDdl, setCopiedDdl] = useState(false);

  const activeSource = overview.sources.find((s) => s.id === selectedSourceId);
  const sourceCubes = useMemo(() => {
    return cubes.filter((c) => c.source_id === selectedSourceId);
  }, [cubes, selectedSourceId]);

  const selectedCube = cubes.find((c) => c.id === selectedCubeId) || sourceCubes[0];

  // Search filtering by table name OR column name
  const filteredCubes = useMemo(() => {
    if (!search.trim()) return sourceCubes;
    const q = search.toLowerCase();
    return sourceCubes.filter((c) => {
      const matchTable =
        c.definition.name.toLowerCase().includes(q) ||
        c.definition.table.toLowerCase().includes(q);
      const matchCol = c.definition.fields.some((f) =>
        f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q)
      );
      return matchTable || matchCol;
    });
  }, [sourceCubes, search]);

  // Generate DDL for the selected table
  const tableDdl = useMemo(() => {
    if (!selectedCube) return "";
    const def = selectedCube.definition;
    const cols = def.fields.map((f) => {
      const pk = f.key ? " PRIMARY KEY" : "";
      const notNull = !f.nullable ? " NOT NULL" : "";
      return `    "${f.name}" ${f.type.toUpperCase()}${pk}${notNull}`;
    });
    let ddl = `CREATE TABLE "${def.schema}"."${def.table}" (\n${cols.join(",\n")}\n);`;
    if (def.joins?.length) {
      ddl += "\n\n-- Foreign key relationships & semantic joins\n";
      for (const j of def.joins) {
        ddl += `-- JOIN "${j.schema}"."${j.table}" ON ${j.path} (${j.cardinality})\n`;
      }
    }
    return ddl;
  }, [selectedCube]);

  function handleCopyDdl() {
    if (!tableDdl) return;
    navigator.clipboard.writeText(tableDdl);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2500);
  }

  function getBadgeColor(type: string) {
    const t = type.toLowerCase();
    if (t.includes("int") || t.includes("num") || t.includes("float") || t.includes("double"))
      return "badge-numeric";
    if (t.includes("char") || t.includes("text") || t.includes("str"))
      return "badge-string";
    if (t.includes("date") || t.includes("time"))
      return "badge-date";
    if (t.includes("bool"))
      return "badge-boolean";
    return "badge-default";
  }

  return (
    <div className="schema-visualizer-container">
      {/* Top Controls Bar */}
      <header className="schema-viz-topbar">
        <div className="schema-viz-title-wrap">
          <div className="icon-badge">
            <Database size={20} />
          </div>
          <div>
            <h2>{t.title}</h2>
            <p className="subtitle">{t.subtitle}</p>
          </div>
        </div>

        <div className="topbar-actions">
          {/* Source Selector */}
          <select
            className="source-select"
            value={selectedSourceId}
            onChange={(e) => onSelectSource(e.target.value)}
          >
            {overview.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.schema_name})
              </option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="view-mode-buttons">
            <Button
              variant="ghost"
              size="plain"
              className={`mode-btn ${viewMode === "map" ? "active" : ""}`}
              onClick={() => setViewMode("map")}
            >
              <Layers size={15} />
              <span>{t.visualMap}</span>
            </Button>
            <Button
              variant="ghost"
              size="plain"
              className={`mode-btn ${viewMode === "details" ? "active" : ""}`}
              onClick={() => setViewMode("details")}
            >
              <Table2 size={15} />
              <span>{t.tableDetails}</span>
            </Button>
            <Button
              variant="ghost"
              size="plain"
              className={`mode-btn ${viewMode === "ddl" ? "active" : ""}`}
              onClick={() => setViewMode("ddl")}
            >
              <Code2 size={15} />
              <span>{t.viewDdl}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Search & Filter Bar */}
      <div className="schema-viz-filter-bar">
        <div className="search-wrap">
          <Search size={16} />
          <Input
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="tables-counter">
          {t.tablesCount(filteredCubes.length)}
        </span>
      </div>

      {/* Main Content Area */}
      <div className="schema-viz-body">
        {/* VIEW 1: Visual Relational Map */}
        {viewMode === "map" && (
          <div className="er-diagram-container">
            <div className="er-diagram-grid">
              {filteredCubes.map((item) => {
                const isSelected = selectedCube?.id === item.id;
                const def = item.definition;
                return (
                  <div
                    key={item.id}
                    className={`er-table-card ${isSelected ? "selected-er-card" : ""}`}
                    onClick={() => onSelectTable(item.id)}
                  >
                    <div className="er-card-header">
                      <div className="table-name-wrap">
                        <Table2 size={16} className="table-icon" />
                        <div>
                          <strong>{def.name}</strong>
                          <small className="sql-table-name">
                            {def.schema}.{def.table}
                          </small>
                        </div>
                      </div>
                      <span className="rows-count-badge">
                        ~{def.estimated_rows.toLocaleString(intl)}
                      </span>
                    </div>

                    <div className="er-columns-list">
                      {def.fields.slice(0, 8).map((field) => (
                        <div key={field.name} className="er-column-row">
                          <div className="col-name-box">
                            {field.key ? (
                              <span title={t.primaryKey}>
                                <Key size={12} className="key-icon pk" />
                              </span>
                            ) : null}
                            <span className="column-name">{field.name}</span>
                          </div>
                          <span className={`type-badge ${getBadgeColor(field.type)}`}>
                            {field.type}
                          </span>
                        </div>
                      ))}
                      {def.fields.length > 8 && (
                        <div className="er-more-cols">
                          +{def.fields.length - 8} more columns…
                        </div>
                      )}
                    </div>

                    {/* Joins preview badges */}
                    {!!def.joins?.length && (
                      <div className="er-card-footer">
                        <div className="relations-summary">
                          <Link2 size={13} />
                          <span>
                            {def.joins.length} relation{def.joins.length > 1 ? "s" : ""} (
                            {def.joins.map((j) => j.table).join(", ")})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: Table Inspection Details */}
        {viewMode === "details" && selectedCube && (
          <div className="table-details-panel">
            <div className="details-header-card">
              <div className="details-title-row">
                <div>
                  <div className="badge-row">
                    <span className="source-tag">{selectedCube.definition.schema}</span>
                    <span className="grain-tag">{selectedCube.definition.grain}</span>
                  </div>
                  <h3>{selectedCube.definition.name}</h3>
                  <p className="table-desc">{selectedCube.definition.description}</p>
                </div>

                <div className="details-actions">
                  <Button
                    variant="ghost"
                    size="plain"
                    className="primary ask-table-btn"
                    onClick={() => onAskAboutTable(selectedCube)}
                  >
                    <Sparkles size={15} />
                    <span>{t.askAboutTable}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="plain"
                    className="secondary profile-table-btn"
                    onClick={onProfileTable}
                  >
                    <Info size={15} />
                    <span>{t.profileData}</span>
                  </Button>
                </div>
              </div>

              <div className="details-metrics-row">
                <div className="detail-metric">
                  <small>{t.columns}</small>
                  <strong>{selectedCube.definition.fields.length}</strong>
                </div>
                <div className="detail-metric">
                  <small>{t.dimensions}</small>
                  <strong>{selectedCube.definition.dimensions.length}</strong>
                </div>
                <div className="detail-metric">
                  <small>{t.measures}</small>
                  <strong>{selectedCube.definition.measures.length}</strong>
                </div>
                <div className="detail-metric">
                  <small>{t.estimatedRows}</small>
                  <strong>
                    ~{selectedCube.definition.estimated_rows.toLocaleString(intl)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Columns Table */}
            <div className="columns-table-card">
              <h4>{t.columns}</h4>
              <div className="scroll-wrapper">
                <table className="viz-columns-table">
                  <thead>
                    <tr>
                      <th>{t.columnName}</th>
                      <th>{t.dataType}</th>
                      <th>{t.businessRole}</th>
                      <th>{t.nullability}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCube.definition.fields.map((f) => (
                      <tr key={f.name}>
                        <td className="col-name-cell">
                          {f.key && <Key size={13} className="key-icon pk" />}
                          <strong>{f.name}</strong>
                        </td>
                        <td>
                          <span className={`type-badge ${getBadgeColor(f.type)}`}>
                            {f.type}
                          </span>
                        </td>
                        <td>
                          <span className="role-tag">
                            {f.role?.replaceAll("_", " ") || (f.key ? "identifier" : "dimension")}
                          </span>
                        </td>
                        <td>
                          <span className={f.nullable ? "nullable-tag" : "required-tag"}>
                            {f.nullable ? t.nullableBadge : t.requiredBadge}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Relationships & Joins */}
            <div className="relations-card">
              <h4>{t.joins}</h4>
              {!selectedCube.definition.joins?.length ? (
                <p className="muted-hint">{t.noJoins}</p>
              ) : (
                <div className="joins-list">
                  {selectedCube.definition.joins.map((join) => (
                    <div key={join.path} className="join-item">
                      <Link2 size={16} className="join-icon" />
                      <div className="join-info">
                        <strong>{join.path}</strong>
                        <span className="join-target">
                          → {join.schema}.{join.table}
                        </span>
                      </div>
                      <span className="cardinality-badge">{join.cardinality}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: SQL DDL Definition */}
        {viewMode === "ddl" && selectedCube && (
          <div className="ddl-panel">
            <div className="ddl-header">
              <div>
                <h4>SQL Definition ({selectedCube.definition.table})</h4>
                <p className="ddl-sub">Standard PostgreSQL DDL export with column constraints</p>
              </div>
              <Button
                variant="ghost"
                size="plain"
                className="secondary copy-ddl-btn"
                onClick={handleCopyDdl}
              >
                {copiedDdl ? (
                  <>
                    <Check size={15} /> {t.copied}
                  </>
                ) : (
                  <>
                    <Copy size={15} /> {t.copyDdl}
                  </>
                )}
              </Button>
            </div>
            <pre className="ddl-code-block" dir="ltr">
              <code>{tableDdl}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
