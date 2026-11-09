"use client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  ArrowRight,
  Database,
  FolderOpen,
  Layers3,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { api, type Source, type SourceOverview } from "@/lib/api";
import { ImportData } from "./import-data";
import { useT } from "@/lib/i18n/client";

export function SourceDashboard({
  overview,
  activeSourceId,
  onOpen,
  onCloseSource,
  onDeleteSource,
  onComplete,
  onRefresh,
}: {
  overview: SourceOverview;
  activeSourceId?: string;
  onOpen: (id: string) => void;
  onCloseSource?: () => void;
  onDeleteSource?: (id: string) => Promise<void>;
  onComplete: (source: Source) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.dashboard;
  const [importing, setImporting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sourceToDelete, setSourceToDelete] = useState<Source | null>(null),
    [deletingId, setDeletingId] = useState<string | null>(null);
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
        <Button
          variant="ghost"
          size="plain"
          className="primary"
          onClick={() => setImporting(true)}
          disabled={busy || importing}
        >
          <Plus size={16} />
          {t.importData}
        </Button>
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
        <Button
          variant="ghost"
          size="plain"
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
        </Button>
      </div>
      {!sources.length ? (
        <section className="sources-empty">
          <span className="empty-source-icon">
            <FolderOpen size={32} />
          </span>
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyText}</p>
          <Button
            variant="ghost"
            size="plain"
            className="secondary"
            onClick={() => setImporting(true)}
            disabled={importing}
          >
            <Upload size={16} />
            {t.importFirst}
          </Button>
          <div className="schema-example">
            <span>sales_2026</span>
            <span>↳ orders</span>
            <span>↳ customers</span>
          </div>
        </section>
      ) : (
        <div className="source-grid">
          {sources.map((source) => {
            const isActive = source.id === activeSourceId;
            return (
              <article
                className={`source-card ${isActive ? "active-profile-card" : ""}`}
                key={source.id}
              >
                <div className="source-card-top">
                  <span className={`source-icon ${source.kind}`}>
                    <Database size={23} />
                  </span>
                  <div className="source-card-badges">
                    {isActive && (
                      <span className="profile-active-badge">
                        <span className="profile-dot" />
                        Active
                      </span>
                    )}
                    <span className="tag">
                      {source.kind === "existing"
                        ? "PostgreSQL"
                        : source.kind.toUpperCase()}
                    </span>
                  </div>
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
                <div className="source-card-footer">
                  <Button
                    variant="ghost"
                    size="plain"
                    className={`source-open ${isActive ? "active-btn" : ""}`}
                    onClick={() => onOpen(source.id)}
                    disabled={busy || Boolean(deletingId)}
                  >
                    {isActive ? "Resume Profile" : "Open Profile"}
                    <ArrowRight size={16} />
                  </Button>
                  {isActive && onCloseSource && (
                    <Button
                      variant="ghost"
                      size="plain"
                      className="source-close-profile-btn"
                      onClick={onCloseSource}
                      disabled={busy || Boolean(deletingId)}
                      title="Close active profile"
                    >
                      Close
                    </Button>
                  )}
                  {onDeleteSource && (
                    <Button
                      variant="ghost"
                      size="plain"
                      className="source-delete-btn"
                      onClick={() => setSourceToDelete(source)}
                      disabled={busy || Boolean(deletingId)}
                      title={t.deleteSource}
                      aria-label={t.deleteSource}
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {sourceToDelete && (
        <div
          className="delete-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          onClick={() => !deletingId && setSourceToDelete(null)}
        >
          <div
            className="delete-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-modal-header">
              <div className="delete-modal-icon">
                <Trash2 size={22} />
              </div>
              <div className="delete-modal-titles">
                <h3 id="delete-dialog-title">{t.deleteSourceTitle}</h3>
                <p className="delete-modal-sub">
                  <strong>{sourceToDelete.name}</strong> ({sourceToDelete.schema_name})
                </p>
              </div>
            </div>
            <p className="delete-modal-text">
              {t.deleteSourcePrompt}
            </p>
            <div className="delete-modal-actions">
              <Button
                variant="ghost"
                size="plain"
                className="delete-cancel-btn"
                onClick={() => setSourceToDelete(null)}
                disabled={Boolean(deletingId)}
              >
                {t.cancel}
              </Button>
              <Button
                variant="ghost"
                size="plain"
                className="delete-confirm-btn"
                disabled={Boolean(deletingId)}
                onClick={async () => {
                  if (!onDeleteSource) return;
                  setDeletingId(sourceToDelete.id);
                  try {
                    await onDeleteSource(sourceToDelete.id);
                    setSourceToDelete(null);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setDeletingId(null);
                  }
                }}
              >
                {deletingId === sourceToDelete.id ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    {t.deleting}
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    {t.deleteSourceConfirm}
                  </>
                )}
              </Button>
            </div>
          </div>
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
              <Button
                variant="ghost"
                size="plain"
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
              </Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
