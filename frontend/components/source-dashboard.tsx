"use client";
import { useState } from "react";
import {
  ArrowRight,
  Database,
  FolderOpen,
  Layers3,
  Plus,
  RefreshCw,
  Table2,
  Upload,
} from "lucide-react";
import { api, type Source, type SourceOverview } from "@/lib/api";
import { ImportData } from "./import-data";
import { useT } from "@/lib/i18n/client";

export function SourceDashboard({
  overview,
  onOpen,
  onComplete,
  onRefresh,
}: {
  overview: SourceOverview;
  onOpen: (id: string) => void;
  onComplete: (source: Source) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.dashboard;
  const [importing, setImporting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sources = overview.sources;
  const importedRows = sources
    .flatMap((s) => s.manifest.tables || [])
    .reduce((total, t) => total + t.row_count, 0);
  async function connect(schema: string) {
    setBusy(true);
    setError("");
    try {
      const source = await api<Source>("sources/connect", {
        schema_name: schema,
      });
      await onComplete(source);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="source-dashboard">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h1>{t.title}</h1>
          <p className="muted">{t.text}</p>
        </div>
        <button
          className="primary"
          onClick={() => setImporting(true)}
          disabled={busy || importing}
        >
          <Plus size={16} />
          {t.importData}
        </button>
      </div>
      <div className="dashboard-stats">
        <div>
          <span className="stat-symbol">
            <Database size={19} />
          </span>
          <div>
            <small>{t.savedSources}</small>
            <strong>{sources.length}</strong>
          </div>
        </div>
        <div>
          <span className="stat-symbol">
            <Table2 size={19} />
          </span>
          <div>
            <small>{t.sourceTables}</small>
            <strong>
              {sources.reduce((total, s) => total + (s.table_count ?? 0), 0)}
            </strong>
          </div>
        </div>
        <div>
          <span className="stat-symbol">
            <Layers3 size={19} />
          </span>
          <div>
            <small>{t.importedRows}</small>
            <strong>{importedRows.toLocaleString(intl)}</strong>
          </div>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {overview.warning && <p className="notice">{overview.warning}</p>}
      {importing && (
        <ImportData
          limits={overview.limits}
          onCancel={() => setImporting(false)}
          onComplete={async (source) => {
            await onComplete(source);
            setImporting(false);
          }}
        />
      )}
      <div className="sources-heading">
        <div>
          <h2>{t.savedSources}</h2>
          <p className="muted">{t.savedText}</p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onRefresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={14} />
          {t.refresh}
        </button>
      </div>
      {!sources.length ? (
        <section className="sources-empty">
          <span className="empty-source-icon">
            <FolderOpen size={32} />
          </span>
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyText}</p>
          <button
            className="secondary"
            onClick={() => setImporting(true)}
            disabled={importing}
          >
            <Upload size={16} />
            {t.importFirst}
          </button>
          <div className="schema-example">
            <span>sales_2026</span>
            <span>↳ orders</span>
            <span>↳ customers</span>
          </div>
        </section>
      ) : (
        <div className="source-grid">
          {sources.map((source) => (
            <article className="source-card" key={source.id}>
              <div className="source-card-top">
                <span className={`source-icon ${source.kind}`}>
                  <Database size={23} />
                </span>
                <span className="tag">
                  {source.kind === "existing"
                    ? "PostgreSQL"
                    : source.kind.toUpperCase()}
                </span>
              </div>
              <h3>{source.name}</h3>
              <code>{source.schema_name}</code>
              <p
                className="source-filename"
                title={source.filename || source.schema_name}
              >
                {source.filename || t.connected}
              </p>
              <div className="source-metadata">
                <span>
                  <Table2 size={13} />
                  {t.tables(source.table_count ?? 0)}
                </span>
                <span>
                  {new Date(source.created_at).toLocaleDateString(intl)}
                </span>
              </div>
              <button
                className="source-open"
                onClick={() => onOpen(source.id)}
                disabled={busy}
              >
                {t.explore}
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
      {!!overview.available_schemas.length && (
        <section className="existing-sources">
          <span className="eyebrow">{t.existingEyebrow}</span>
          <h2>{t.existingTitle}</h2>
          <p className="muted">{t.existingText}</p>
          {overview.available_schemas.map((schema) => (
            <div className="existing-source" key={schema.schema_name}>
              <Database size={18} />
              <div>
                <strong>{schema.schema_name}</strong>
                <small>{t.available(schema.table_count)}</small>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => connect(schema.schema_name)}
              >
                {sources.some(
                  (s) =>
                    s.kind === "existing" &&
                    s.schema_name === schema.schema_name,
                )
                  ? t.reopen
                  : t.use}
                <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
