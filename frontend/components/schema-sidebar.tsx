"use client";
import { useState } from "react";
import {
  Database,
  X,
  Plus,
  Search,
  Table2,
  RefreshCw,
  ChevronRight,
  Layers3,
} from "lucide-react";
import type { Cube, SourceOverview } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function SchemaSidebar({
  leftOpen,
  rightOpen,
  busy,
  overview,
  selectedSource,
  sourceCubes,
  selected,
  cube,
  onClose,
  onSourceChange,
  onChooseTable,
  onDiscover,
  onViewSchema,
  onUpload,
}: {
  leftOpen: boolean;
  rightOpen: boolean;
  busy: boolean;
  overview: SourceOverview;
  selectedSource: string;
  sourceCubes: Cube[];
  selected: string;
  cube?: Cube;
  onClose: () => void;
  onSourceChange: (id: string) => void;
  onChooseTable: (id: string) => void;
  onDiscover: () => void;
  onViewSchema: () => void;
  onUpload: () => void;
}) {
  const t = useT().t.schema;
  const [schemaSearch, setSchemaSearch] = useState("");
  return (
    <aside
      id="schema-sidebar"
      className={`schema-sidebar ${rightOpen ? "is-open" : ""}`}
      aria-label={t.label}
      role={rightOpen ? "dialog" : undefined}
      aria-modal={rightOpen || undefined}
      inert={leftOpen}
    >
      <div className="schema-sidebar-heading">
        <div>
          <Database size={17} />
          <h2>{t.title}</h2>
        </div>
        <button
          className="icon-button drawer-close"
          aria-label={t.close}
          onClick={() => onClose()}
        >
          <X size={18} />
        </button>
      </div>
      <label className="source-selector">
        {t.active}
        <select
          aria-label={t.activeLabel}
          value={selectedSource}
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) onSourceChange(e.target.value);
          }}
        >
          <option value="">{t.choose}</option>
          {overview.sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.schema_name}
            </option>
          ))}
        </select>
      </label>
      <label className="sidebar-search">
        <Search size={15} />
        <input
          aria-label={t.search}
          placeholder={t.searchPlaceholder}
          value={schemaSearch}
          onChange={(e) => setSchemaSearch(e.target.value)}
        />
      </label>
      <div className="section-label">
        <Table2 size={13} /> {t.tables} <span>{sourceCubes.length}</span>
        <button
          className="icon-button"
          aria-label={t.refresh}
          disabled={busy || !selectedSource}
          onClick={onDiscover}
        >
          <RefreshCw size={14} className={busy ? "spin" : ""} />
        </button>
      </div>
      <div className="schema-table-list">
        {sourceCubes
          .filter((item) =>
            `${item.definition.name} ${item.definition.table}`
              .toLowerCase()
              .includes(schemaSearch.toLowerCase()),
          )
          .map((item) => (
            <button
              key={item.id}
              disabled={busy}
              aria-pressed={selected === item.id}
              className={`cube-item ${selected === item.id ? "selected" : ""}`}
              onClick={() => onChooseTable(item.id)}
            >
              <Table2 size={16} />
              <span>
                {item.definition.name}
                <small>{item.definition.table}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
        {!sourceCubes.length && (
          <p className="sidebar-hint">
            {selectedSource ? t.discoverHint : t.chooseHint}
          </p>
        )}
        {!!sourceCubes.length &&
          !sourceCubes.some((item) =>
            `${item.definition.name} ${item.definition.table}`
              .toLowerCase()
              .includes(schemaSearch.toLowerCase()),
          ) && <p className="sidebar-hint">{t.noMatch}</p>}
      </div>
      {cube && (
        <div className="schema-details">
          <div className="section-label">
            {t.selected} <span>{t.fields(cube.definition.fields.length)}</span>
          </div>
          <h3>{cube.definition.table}</h3>
          <div className="field-list">
            {cube.definition.fields.map((field) => (
              <div key={field.name}>
                <span title={field.description || field.name}>
                  <span className={`field-kind ${field.key ? "key" : ""}`}>
                    {field.key ? "⌑" : "#"}
                  </span>
                  {field.name}
                </span>
                <code>{field.type}</code>
              </div>
            ))}
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              onViewSchema();
              onClose();
            }}
          >
            {t.viewSchema} <ChevronRight size={14} />
          </button>
        </div>
      )}
      <div className="schema-sidebar-footer">
        <Layers3 size={18} />
        <div>
          {t.more}
          <small>{t.moreHint}</small>
        </div>
        <button
          className="icon-button"
          aria-label={t.add}
          disabled={busy}
          onClick={() => {
            onUpload();
            onClose();
          }}
        >
          <Plus size={18} />
        </button>
      </div>
    </aside>
  );
}
