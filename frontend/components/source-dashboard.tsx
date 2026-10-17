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
          <span className="eyebrow">YOUR ANALYTICS START HERE</span>
          <h1>A home for every dataset.</h1>
          <p className="muted">
            Import a file or reopen an existing source. Your tables stay
            organized by schema.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => setImporting(true)}
          disabled={busy || importing}
        >
          <Plus size={16} />
          Import data
        </button>
      </div>
      <div className="dashboard-stats">
        <div>
          <span className="stat-symbol">
            <Database size={19} />
          </span>
          <div>
            <small>Saved sources</small>
            <strong>{sources.length}</strong>
          </div>
        </div>
        <div>
          <span className="stat-symbol">
            <Table2 size={19} />
          </span>
          <div>
            <small>Source tables</small>
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
            <small>Imported rows</small>
            <strong>{importedRows.toLocaleString()}</strong>
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
          <h2>Saved sources</h2>
          <p className="muted">Continue from where your data already lives.</p>
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
          Refresh
        </button>
      </div>
      {!sources.length ? (
        <section className="sources-empty">
          <span className="empty-source-icon">
            <FolderOpen size={32} />
          </span>
          <h2>Your first source belongs here</h2>
          <p>
            Upload a CSV to create a table, or a SQLite database to import
            several tables into one schema.
          </p>
          <button
            className="secondary"
            onClick={() => setImporting(true)}
            disabled={importing}
          >
            <Upload size={16} />
            Import your first dataset
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
                {source.filename || "Connected PostgreSQL schema"}
              </p>
              <div className="source-metadata">
                <span>
                  <Table2 size={13} />
                  {source.table_count ?? 0}{" "}
                  {(source.table_count ?? 0) === 1 ? "table" : "tables"}
                </span>
                <span>{new Date(source.created_at).toLocaleDateString()}</span>
              </div>
              <button
                className="source-open"
                onClick={() => onOpen(source.id)}
                disabled={busy}
              >
                Explore source
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
      {!!overview.available_schemas.length && (
        <section className="existing-sources">
          <span className="eyebrow">EXISTING POSTGRESQL SCHEMAS</span>
          <h2>Use a source already connected</h2>
          <p className="muted">
            These schemas are available from your configured PostgreSQL
            connection.
          </p>
          {overview.available_schemas.map((schema) => (
            <div className="existing-source" key={schema.schema_name}>
              <Database size={18} />
              <div>
                <strong>{schema.schema_name}</strong>
                <small>
                  {schema.table_count}{" "}
                  {schema.table_count === 1 ? "table" : "tables"} available
                </small>
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
                  ? "Reopen source"
                  : "Use this schema"}
                <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
