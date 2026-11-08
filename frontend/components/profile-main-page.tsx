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
  ArrowLeft,
  RefreshCw,
  X,
  TrendingUp,
  BarChart3,
  ChevronRight,
  Layers3,
  Calendar,
  FileSpreadsheet,
} from "lucide-react";
import type { Cube, Source, SourceOverview, UserInfo } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function ProfileMainPage({
  source,
  cubes,
  overview,
  user,
  selectedCubeId,
  onSelectTable,
  onStartChat,
  onDiscover,
  onCloseProfile,
  busy,
}: {
  source: Source;
  cubes: Cube[];
  overview: SourceOverview;
  user?: UserInfo;
  selectedCubeId: string;
  onSelectTable: (id: string) => void;
  onStartChat: (initialPrompt?: string, cubeIds?: string[]) => void;
  onDiscover: () => Promise<void>;
  onCloseProfile: () => void;
  busy: boolean;
}) {
  const { t: dictionary, intl, locale } = useT();
  const tWorkspace = dictionary.workspace;
  const isAr = locale === "ar";

  const [activeTab, setActiveTab] = useState<"structure" | "erd" | "ddl">("structure");
  const [search, setSearch] = useState("");
  const [copiedDdl, setCopiedDdl] = useState(false);

  // Filter tables in this profile
  const sourceCubes = useMemo(() => {
    return cubes.filter((c) => c.source_id === source.id);
  }, [cubes, source.id]);

  const selectedCube =
    sourceCubes.find((c) => c.id === selectedCubeId) || sourceCubes[0];

  // Aggregated profile stats
  const totalTables = sourceCubes.length;
  const totalEstimatedRows = sourceCubes.reduce(
    (acc, c) => acc + (c.definition.estimated_rows || 0),
    0
  );
  const totalColumns = sourceCubes.reduce(
    (acc, c) => acc + (c.definition.fields?.length || 0),
    0
  );
  const totalMeasures = sourceCubes.reduce(
    (acc, c) => acc + (c.definition.measures?.length || 0),
    0
  );
  const totalJoins = sourceCubes.reduce(
    (acc, c) => acc + (c.definition.joins?.length || 0),
    0
  );

  const kindLabel =
    source.kind === "existing"
      ? "PostgreSQL"
      : source.kind.toUpperCase();

  // Search filtering
  const filteredCubes = useMemo(() => {
    if (!search.trim()) return sourceCubes;
    const q = search.toLowerCase();
    return sourceCubes.filter((c) => {
      const matchTable =
        c.definition.name.toLowerCase().includes(q) ||
        c.definition.table.toLowerCase().includes(q);
      const matchCol = c.definition.fields.some(
        (f) =>
          f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q)
      );
      return matchTable || matchCol;
    });
  }, [sourceCubes, search]);

  // SQL DDL Generation for the profile or selected table
  const fullDdl = useMemo(() => {
    if (!sourceCubes.length) return "-- No tables discovered yet.";
    return sourceCubes
      .map((c) => {
        const def = c.definition;
        const cols = def.fields.map((f) => {
          const pk = f.key ? " PRIMARY KEY" : "";
          const notNull = !f.nullable ? " NOT NULL" : "";
          return `    "${f.name}" ${f.type.toUpperCase()}${pk}${notNull}`;
        });
        let ddl = `CREATE TABLE "${def.schema}"."${def.table}" (\n${cols.join(",\n")}\n);`;
        if (def.joins?.length) {
          ddl += "\n-- Relationships\n";
          for (const j of def.joins) {
            ddl += `-- JOIN "${j.schema}"."${j.table}" ON ${j.path} (${j.cardinality})\n`;
          }
        }
        return ddl;
      })
      .join("\n\n");
  }, [sourceCubes]);

  function handleCopyDdl() {
    if (!fullDdl) return;
    navigator.clipboard.writeText(fullDdl);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2200);
  }

  function getBadgeColor(type: string) {
    const t = type.toLowerCase();
    if (
      t.includes("int") ||
      t.includes("num") ||
      t.includes("float") ||
      t.includes("double") ||
      t.includes("decimal")
    )
      return "badge-numeric";
    if (t.includes("char") || t.includes("text") || t.includes("str"))
      return "badge-string";
    if (t.includes("date") || t.includes("time") || t.includes("timestamp"))
      return "badge-date";
    if (t.includes("bool")) return "badge-boolean";
    return "badge-default";
  }

  return (
    <div className="profile-main-page">
      {/* Top Breadcrumb Navigation */}
      <nav className="profile-breadcrumb-bar">
        <Button
          variant="ghost"
          size="plain"
          className="back-to-workspace-btn"
          onClick={onCloseProfile}
        >
          {isAr ? <ChevronRight size={16} /> : <ArrowLeft size={16} />}
          <span>{isAr ? "مساحة العمل" : "Workspace Overview"}</span>
        </Button>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">
          <Database size={14} />
          <strong><bdi>{source.schema_name}</bdi></strong>
        </span>
      </nav>

      {/* Hero Profile Presentation Card */}
      <header className="profile-hero-card">
        <div className="hero-top-row">
          <div className="hero-identity">
            <span className={`profile-kind-icon ${source.kind}`}>
              <Database size={26} />
            </span>
            <div className="hero-text-wrap">
              <div className="hero-title-line">
                <h1><bdi>{source.name || source.schema_name}</bdi></h1>
                <span className="source-kind-pill">{kindLabel}</span>
                <span className="profile-active-indicator">
                  <span className="dot dot-active" />
                  {isAr ? "ملف نشط" : "Active Profile"}
                </span>
              </div>
              <p className="hero-meta-line">
                <span className="meta-schema">
                  <code>{source.schema_name}</code>
                </span>
                {source.filename && (
                  <>
                    <span className="meta-dot">·</span>
                    <span className="meta-file" title={source.filename}>
                      <FileSpreadsheet size={13} />
                      <bdi>{source.filename}</bdi>
                    </span>
                  </>
                )}
                <span className="meta-dot">·</span>
                <span className="meta-date">
                  <Calendar size={13} />
                  {new Date(source.created_at).toLocaleDateString(intl, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </p>
            </div>
          </div>

          <div className="hero-actions">
            <Button
              variant="ghost"
              size="plain"
              className="primary start-chat-cta"
              onClick={() => onStartChat()}
              disabled={busy || totalTables === 0}
            >
              <Sparkles size={16} />
              <span>{isAr ? "بدء محادثة ذكية" : "Start AI Chat"}</span>
              {isAr ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
            </Button>

            <Button
              variant="ghost"
              size="plain"
              className="secondary discover-btn"
              onClick={onDiscover}
              disabled={busy}
              title={isAr ? "تحديث واكتشاف جداول هذا المصدر" : "Refresh & discover tables"}
            >
              <RefreshCw size={14} className={busy ? "spin" : ""} />
              <span>{isAr ? "تحديث الجداول" : "Discover Tables"}</span>
            </Button>

            <Button
              variant="ghost"
              size="plain"
              className="ghost-action close-profile-btn"
              onClick={onCloseProfile}
              title={isAr ? "إغلاق هذا الملف والعودة لمساحة العمل" : "Close profile and return to workspace"}
            >
              <X size={15} />
            </Button>
          </div>
        </div>

        {/* 5 High-Level Data Presentation KPI Metrics */}
        <div className="profile-metrics-bar">
          <div className="metric-pill">
            <Table2 size={16} className="metric-icon tables-metric" />
            <div className="metric-content">
              <strong>{totalTables}</strong>
              <small>{isAr ? "جداول" : "Tables"}</small>
            </div>
          </div>

          <div className="metric-pill">
            <TrendingUp size={16} className="metric-icon rows-metric" />
            <div className="metric-content">
              <strong>~{totalEstimatedRows.toLocaleString(intl)}</strong>
              <small>{isAr ? "إجمالي الصفوف" : "Estimated Rows"}</small>
            </div>
          </div>

          <div className="metric-pill">
            <Layers size={16} className="metric-icon cols-metric" />
            <div className="metric-content">
              <strong>{totalColumns}</strong>
              <small>{isAr ? "أعمدة وحقول" : "Columns"}</small>
            </div>
          </div>

          <div className="metric-pill">
            <BarChart3 size={16} className="metric-icon measures-metric" />
            <div className="metric-content">
              <strong>{totalMeasures}</strong>
              <small>{isAr ? "مقاييس تحليلية" : "Measures"}</small>
            </div>
          </div>

          <div className="metric-pill">
            <Link2 size={16} className="metric-icon joins-metric" />
            <div className="metric-content">
              <strong>{totalJoins}</strong>
              <small>{isAr ? "علاقات ومفاتيح" : "Relationships"}</small>
            </div>
          </div>
        </div>
      </header>

      {/* Main Presentation of Data & Data Structure Navigation Tabs */}
      <section className="profile-structure-section">
        <div className="structure-nav-header">
          <div className="structure-tabs">
            <Button
              variant="ghost"
              size="plain"
              className={`structure-tab-btn ${activeTab === "structure" ? "active" : ""}`}
              onClick={() => setActiveTab("structure")}
            >
              <Table2 size={16} />
              <span>{isAr ? "فهرس الجداول والحقول" : "Table Catalog & Schema"}</span>
            </Button>

            <Button
              variant="ghost"
              size="plain"
              className={`structure-tab-btn ${activeTab === "erd" ? "active" : ""}`}
              onClick={() => setActiveTab("erd")}
            >
              <Layers3 size={16} />
              <span>{isAr ? "مخطط العلاقات (ERD)" : "Relational Map (ERD)"}</span>
            </Button>

            <Button
              variant="ghost"
              size="plain"
              className={`structure-tab-btn ${activeTab === "ddl" ? "active" : ""}`}
              onClick={() => setActiveTab("ddl")}
            >
              <Code2 size={16} />
              <span>{isAr ? "تعريف SQL (DDL)" : "SQL Schema (DDL)"}</span>
            </Button>
          </div>

          {activeTab === "ddl" && (
            <Button
              variant="ghost"
              size="plain"
              className="secondary copy-ddl-btn"
              onClick={handleCopyDdl}
            >
              {copiedDdl ? (
                <>
                  <Check size={14} /> {isAr ? "تم النسخ" : "Copied"}
                </>
              ) : (
                <>
                  <Copy size={14} /> {isAr ? "نسخ SQL" : "Copy SQL"}
                </>
              )}
            </Button>
          )}
        </div>

        {/* TAB 1: TABLE CATALOG & DETAILED SCHEMA */}
        {activeTab === "structure" && (
          <div className="profile-catalog-container">
            {totalTables === 0 ? (
              <div className="catalog-empty-state">
                <Table2 size={36} className="empty-icon" />
                <h3>{isAr ? "لا توجد جداول مكتشفة حتى الآن" : "No tables discovered yet in this profile"}</h3>
                <p>
                  {isAr
                    ? "انقر على زر 'تحديث الجداول' لاكتشاف الجداول تلقائيًا من قاعدة البيانات أو الملف."
                    : "Click 'Discover Tables' to automatically inspect and map the tables in this data source."}
                </p>
                <Button
                  variant="ghost"
                  size="plain"
                  className="primary"
                  onClick={onDiscover}
                  disabled={busy}
                >
                  <RefreshCw size={15} className={busy ? "spin" : ""} />
                  {isAr ? "اكتشاف الجداول الآن" : "Discover Tables Now"}
                </Button>
              </div>
            ) : (
              <div className="catalog-split-view">
                {/* Left Table Selector List */}
                <aside className="catalog-tables-list">
                  <div className="table-search-box">
                    <Search size={15} />
                    <Input
                      placeholder={isAr ? "بحث في الجداول والحقول…" : "Search tables or columns…"}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  <div className="tables-scroll-list">
                    {filteredCubes.map((item) => {
                      const isSelected = selectedCube?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`table-list-item ${isSelected ? "selected-table" : ""}`}
                          onClick={() => onSelectTable(item.id)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="item-name-row">
                            <Table2 size={16} className="table-icon" />
                            <strong>{item.definition.name}</strong>
                          </div>
                          <div className="item-meta-row">
                            <span>{item.definition.fields.length} {isAr ? "أعمدة" : "cols"}</span>
                            <span>~{item.definition.estimated_rows.toLocaleString(intl)} {isAr ? "صفوف" : "rows"}</span>
                          </div>
                          {!!item.definition.joins?.length && (
                            <div className="item-joins-tag">
                              <Link2 size={11} /> {item.definition.joins.length} {isAr ? "علاقات" : "relations"}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredCubes.length === 0 && (
                      <p className="no-tables-match">
                        {isAr ? "لم يتم العثور على جداول مطابقة" : "No tables match your search"}
                      </p>
                    )}
                  </div>
                </aside>

                {/* Right Table Deep Inspector */}
                <main className="catalog-table-inspector">
                  {selectedCube ? (
                    <>
                      {/* Table Header Details */}
                      <div className="inspector-header">
                        <div className="inspector-title-wrap">
                          <div className="table-tags-line">
                            <span className="schema-badge">{selectedCube.definition.schema}</span>
                            <span className="grain-badge">{selectedCube.definition.grain}</span>
                          </div>
                          <h2>{selectedCube.definition.name}</h2>
                          <p className="table-desc">
                            {selectedCube.definition.description ||
                              (isAr ? "جدول تحليلي مهيأ للاستعلامات والربط الذكي." : "Analytical table ready for semantic querying.")}
                          </p>
                        </div>

                        <div className="inspector-quick-actions">
                          <Button
                            variant="ghost"
                            size="plain"
                            className="primary ask-table-btn"
                            onClick={() =>
                              onStartChat(
                                isAr
                                  ? `قدم تحليلاً شاملاً لبيانات جدول ${selectedCube.definition.name}`
                                  : `Provide a comprehensive analysis of ${selectedCube.definition.name}`,
                                [selectedCube.id]
                              )
                            }
                          >
                            <Sparkles size={14} />
                            <span>{isAr ? "سؤال الذكاء عن هذا الجدول" : "Ask AI About This Table"}</span>
                          </Button>
                        </div>
                      </div>

                      {/* Columns Catalog */}
                      <div className="inspector-section">
                        <div className="section-title-row">
                          <h3>
                            <Layers size={15} />
                            <span>{isAr ? "حقول وأعمدة الجدول" : "Columns & Data Types"}</span>
                          </h3>
                          <span className="count-pill">
                            {selectedCube.definition.fields.length} {isAr ? "أعمدة" : "columns"}
                          </span>
                        </div>

                        <div className="columns-table-wrapper">
                          <table className="profile-columns-table">
                            <thead>
                              <tr>
                                <th>{isAr ? "اسم العمود" : "Column Name"}</th>
                                <th>{isAr ? "النوع" : "Data Type"}</th>
                                <th>{isAr ? "الدور التحليلي" : "Business Role"}</th>
                                <th>{isAr ? "القابلية للإفراغ" : "Nullability"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedCube.definition.fields.map((f) => (
                                <tr key={f.name}>
                                  <td className="col-name-cell">
                                    {f.key ? (
                                      <span title={isAr ? "مفتاح أساسي" : "Primary Key"}>
                                        <Key size={13} className="key-icon pk" />
                                      </span>
                                    ) : (
                                      <span className="col-symbol">#</span>
                                    )}
                                    <strong>{f.name}</strong>
                                  </td>
                                  <td>
                                    <span className={`type-badge ${getBadgeColor(f.type)}`}>
                                      {f.type}
                                    </span>
                                  </td>
                                  <td>
                                    <span className="role-tag">
                                      {f.role?.replaceAll("_", " ") ||
                                        (f.key ? (isAr ? "معرّف" : "identifier") : (isAr ? "بُعد" : "dimension"))}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={f.nullable ? "nullable-tag" : "required-tag"}>
                                      {f.nullable ? (isAr ? "اختياري (NULL)" : "Nullable") : (isAr ? "إلزامي" : "NOT NULL")}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Defined Measures */}
                      {!!selectedCube.definition.measures?.length && (
                        <div className="inspector-section">
                          <div className="section-title-row">
                            <h3>
                              <BarChart3 size={15} />
                              <span>{isAr ? "المقاييس التحليلية الجاهزة" : "Predefined Measures"}</span>
                            </h3>
                            <span className="count-pill">
                              {selectedCube.definition.measures.length}
                            </span>
                          </div>
                          <div className="measures-chips-grid">
                            {selectedCube.definition.measures.map((m, idx) => (
                              <div
                                key={idx}
                                className="measure-card-chip"
                                title={m.description || m.label}
                              >
                                <span className="measure-agg">{m.aggregation.toUpperCase()}</span>
                                <strong>{m.label || m.field || "*"}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Joins and Foreign Keys */}
                      {!!selectedCube.definition.joins?.length && (
                        <div className="inspector-section">
                          <div className="section-title-row">
                            <h3>
                              <Link2 size={15} />
                              <span>{isAr ? "العلاقات والربط مع الجداول الأخرى" : "Relationships & Joins"}</span>
                            </h3>
                            <span className="count-pill">
                              {selectedCube.definition.joins.length}
                            </span>
                          </div>
                          <div className="joins-card-list">
                            {selectedCube.definition.joins.map((join) => (
                              <div key={join.path} className="join-row-card">
                                <Link2 size={16} className="join-icon" />
                                <div className="join-details">
                                  <strong>{join.path}</strong>
                                  <span className="join-target">
                                    → {join.schema}.{join.table}
                                  </span>
                                </div>
                                <span className="join-cardinality">{join.cardinality}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suggested Questions for This Table */}
                      {!!selectedCube.definition.suggested_questions?.length && (
                        <div className="inspector-section">
                          <div className="section-title-row">
                            <h3>
                              <Sparkles size={15} />
                              <span>{isAr ? "أسئلة مقترحة حول هذا الجدول" : "Suggested Analytical Questions"}</span>
                            </h3>
                          </div>
                          <div className="table-questions-grid">
                            {selectedCube.definition.suggested_questions.map((q) => (
                              <Button
                                variant="ghost"
                                size="plain"
                                key={q}
                                className="table-question-chip"
                                onClick={() => onStartChat(q, [selectedCube.id])}
                              >
                                <Sparkles size={13} />
                                <span>{q}</span>
                                <ArrowRight size={13} className="arrow-icon" />
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="select-table-prompt">
                      <Table2 size={32} />
                      <p>{isAr ? "اختر جدولاً من القائمة لعرض بنيته" : "Select a table from the left to inspect its structure"}</p>
                    </div>
                  )}
                </main>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RELATIONAL MAP (ERD) */}
        {activeTab === "erd" && (
          <div className="erd-view-container">
            <div className="erd-cards-grid">
              {sourceCubes.map((item) => {
                const isSelected = selectedCube?.id === item.id;
                const def = item.definition;
                return (
                  <div
                    key={item.id}
                    className={`erd-card ${isSelected ? "erd-card-selected" : ""}`}
                    onClick={() => onSelectTable(item.id)}
                  >
                    <div className="erd-card-header">
                      <div className="erd-table-title">
                        <Table2 size={15} />
                        <strong>{def.name}</strong>
                      </div>
                      <span className="erd-rows-badge">
                        ~{def.estimated_rows.toLocaleString(intl)}
                      </span>
                    </div>

                    <div className="erd-fields-list">
                      {def.fields.slice(0, 7).map((f) => (
                        <div key={f.name} className="erd-field-row">
                          <div className="erd-col-name">
                            {f.key ? <Key size={11} className="key-icon pk" /> : null}
                            <span>{f.name}</span>
                          </div>
                          <span className={`type-badge ${getBadgeColor(f.type)}`}>
                            {f.type}
                          </span>
                        </div>
                      ))}
                      {def.fields.length > 7 && (
                        <div className="erd-more-fields">
                          +{def.fields.length - 7} {isAr ? "حقول إضافية…" : "more columns…"}
                        </div>
                      )}
                    </div>

                    {!!def.joins?.length && (
                      <div className="erd-joins-footer">
                        <Link2 size={12} />
                        <span>
                          {def.joins.length} {isAr ? "علاقات" : "relations"} (
                          {def.joins.map((j) => j.table).join(", ")})
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: SQL DDL */}
        {activeTab === "ddl" && (
          <div className="profile-ddl-container">
            <div className="ddl-info-bar">
              <div>
                <h4>{isAr ? "مخطط SQL الكامل لهذا الملف" : "Full SQL DDL Schema for this Profile"}</h4>
                <p>
                  {isAr
                    ? "تعريفات جداول PostgreSQL والقيود والعلاقات الدلالية"
                    : "PostgreSQL CREATE TABLE definitions with column types and relational comments"}
                </p>
              </div>
            </div>
            <pre className="profile-ddl-code" dir="ltr">
              <code>{fullDdl}</code>
            </pre>
          </div>
        )}
      </section>

      {/* Suggested Analytical Starters for this Dataset */}
      <section className="profile-starters-section">
        <h3 className="starters-heading">
          <Sparkles size={16} />
          <span>{isAr ? "تحليلات واستفسارات سريعة لهذا الملف" : "Quick Analytical Insights for this Profile"}</span>
        </h3>
        <div className="profile-starters-grid">
          <div
            className="starter-tile"
            onClick={() =>
              onStartChat(
                isAr
                  ? `أعطني ملخصاً تنفيذياً شاملاً لأهم المؤشرات والأرقام في بيانات ${source.name || source.schema_name}`
                  : `Give me an executive summary with key metrics and insights across ${source.name || source.schema_name}`
              )
            }
            role="button"
            tabIndex={0}
          >
            <div className="tile-icon">
              <Sparkles size={18} />
            </div>
            <div className="tile-info">
              <strong>{isAr ? "ملخص تحليلي تنفيذي" : "Executive Data Summary"}</strong>
              <p>
                {isAr
                  ? "تحليل شامل عبر الجداول لاستخراج أهم الاتجاهات والمؤشرات العامة."
                  : "Synthesize high-level trends, totals, and distributions across all tables."}
              </p>
            </div>
            <ChevronRight size={18} className="tile-arrow" />
          </div>

          <div
            className="starter-tile"
            onClick={() =>
              onStartChat(
                isAr
                  ? `قم برسم مخطط بياني يوضح التوزيع والمقارنة لأعلى القيم في ${selectedCube?.definition.name || "البيانات"}`
                  : `Generate a visual chart showing distribution and comparison for top values in ${selectedCube?.definition.name || "data"}`
              )
            }
            role="button"
            tabIndex={0}
          >
            <div className="tile-icon chart-tile">
              <BarChart3 size={18} />
            </div>
            <div className="tile-info">
              <strong>{isAr ? "رسم بياني وتصور بصري" : "Visual Chart & Breakdown"}</strong>
              <p>
                {isAr
                  ? "إنشاء رسومات بيانية ذكية (2D/3D) لمقارنة المقاييس والأبعاد."
                  : "Auto-generate interactive 2D and 3D visual charts for dimensions and metrics."}
              </p>
            </div>
            <ChevronRight size={18} className="tile-arrow" />
          </div>

          <div
            className="starter-tile"
            onClick={() =>
              onStartChat(
                isAr
                  ? `افحص جودة واكتمال البيانات في جداول هذا الملف واذكر أي قيم مفقودة أو شاذة`
                  : `Inspect data quality and completeness across tables and report missing or anomaly values`
              )
            }
            role="button"
            tabIndex={0}
          >
            <div className="tile-icon quality-tile">
              <TrendingUp size={18} />
            </div>
            <div className="tile-info">
              <strong>{isAr ? "فحص جودة واكتمال البيانات" : "Data Quality & Completeness"}</strong>
              <p>
                {isAr
                  ? "اكتشاف القيم الشاذة، نسبة الحقول المكتملة، والأنماط الإحصائية."
                  : "Profile field distributions, null ratios, and detect anomalous patterns."}
              </p>
            </div>
            <ChevronRight size={18} className="tile-arrow" />
          </div>
        </div>
      </section>
    </div>
  );
}
