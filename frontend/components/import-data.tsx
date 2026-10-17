"use client";
import { useRef, useState } from "react";
import { Check, FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react";
import {
  upload,
  type ImportPreview,
  type Source,
  type SourceOverview,
} from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function ImportData({
  limits,
  onComplete,
  onCancel,
}: {
  limits: SourceOverview["limits"];
  onComplete: (source: Source) => Promise<void>;
  onCancel: () => void;
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.imports;
  const megabytes = Math.floor(limits.max_bytes / 1024 / 1024);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [schema, setSchema] = useState(""),
    [tableName, setTableName] = useState("data"),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [phase, setPhase] = useState<"preview" | "import">("preview");
  const input = useRef<HTMLInputElement>(null);
  async function inspect(candidate: File) {
    if (busy) return;
    setError("");
    setPreview(null);
    setFile(candidate);
    if (candidate.size > limits.max_bytes) {
      setError(t.tooLarge(megabytes));
      return;
    }
    setBusy(true);
    setPhase("preview");
    try {
      const form = new FormData();
      form.append("file", candidate);
      const result = await upload<ImportPreview>("sources/preview", form);
      setPreview(result);
      setSchema(result.suggested_schema);
      setSelected(result.tables.map((t) => t.original_name));
      setTableName("data");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !preview || !selected.length || busy) return;
    setBusy(true);
    setPhase("import");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("schema_name", schema);
      form.append("tables", JSON.stringify(selected));
      form.append("table_name", tableName);
      const source = await upload<Source>("sources/import", form);
      await onComplete(source);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="import-panel" aria-labelledby="import-title">
      <div className="import-header">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h2 id="import-title">{t.title}</h2>
          <p className="muted">{t.text}</p>
        </div>
        <button
          className="icon-button"
          onClick={onCancel}
          disabled={busy}
          aria-label={t.close}
        >
          <X size={20} />
        </button>
      </div>
      <input
        ref={input}
        className="sr-only"
        id="source-file"
        type="file"
        accept=".csv,.db,.sqlite,.sqlite3"
        disabled={busy}
        onChange={(e) => {
          const candidate = e.target.files?.[0];
          if (candidate) void inspect(candidate);
        }}
      />
      <button
        className={`upload-zone ${busy ? "upload-busy" : ""}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const candidate = e.dataTransfer.files[0];
          if (candidate) void inspect(candidate);
        }}
      >
        <span className="upload-icon">
          {busy ? (
            <LoaderCircle className="spin" size={24} />
          ) : (
            <Upload size={24} />
          )}
        </span>
        <strong>
          {busy
            ? phase === "preview"
              ? t.inspecting
              : t.importing
            : file
              ? file.name
              : t.choose}
        </strong>
        <span>{t.limits(megabytes, limits.max_rows.toLocaleString(intl))}</span>
        <small>{t.hint}</small>
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <form onSubmit={confirm} className="import-preview">
          <div className="import-options">
            <label>
              {t.schemaName}
              <input
                required
                value={schema}
                maxLength={200}
                disabled={busy}
                onChange={(e) => setSchema(e.target.value)}
                aria-describedby="schema-help"
              />
            </label>
            {preview.kind === "csv" && (
              <label>
                {t.tableName}
                <input
                  required
                  maxLength={200}
                  value={tableName}
                  disabled={busy}
                  onChange={(e) => setTableName(e.target.value)}
                />
              </label>
            )}
          </div>
          <p id="schema-help" className="field-help">
            {t.schemaHelp}
          </p>
          <div className="preview-title">
            <h3>
              {t.chooseTables}{" "}
              <span>
                {selected.length}/{preview.tables.length}
              </span>
            </h3>
            {preview.tables.length > 1 && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() =>
                  setSelected(
                    selected.length === preview.tables.length
                      ? []
                      : preview.tables.map((t) => t.original_name),
                  )
                }
              >
                {selected.length === preview.tables.length
                  ? t.deselectAll
                  : t.selectAll}
              </button>
            )}
          </div>
          {preview.tables.map((table) => (
            <section className="table-preview" key={table.original_name}>
              <label className="table-choice">
                <input
                  type="checkbox"
                  checked={selected.includes(table.original_name)}
                  disabled={busy}
                  onChange={(e) =>
                    setSelected((previous) =>
                      e.target.checked
                        ? [...previous, table.original_name]
                        : previous.filter((t) => t !== table.original_name),
                    )
                  }
                />
                <FileSpreadsheet size={18} />
                <span>
                  <strong>{table.original_name}</strong>
                  <small>
                    → {preview.kind === "csv" ? tableName : table.name}
                  </small>
                </span>
                <span className="preview-table-stats">
                  {t.tableStats(
                    table.row_count.toLocaleString(intl),
                    table.columns.length,
                  )}
                </span>
              </label>
              <details open={preview.tables.length === 1}>
                <summary>
                  {t.previewFields}
                  {table.primary_key.length
                    ? t.primaryKey(table.primary_key.join(", "))
                    : ""}
                  {table.foreign_keys.length
                    ? t.foreignKeys(table.foreign_keys.length)
                    : ""}
                </summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {table.columns.map((column) => (
                          <th key={column.name}>
                            {column.original_name}
                            <small>
                              {column.name} · {column.type}
                            </small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.sample_rows.map((row, index) => (
                        <tr key={index}>
                          {row.map((value, i) => (
                            <td key={i}>
                              {value === null ? (
                                <span className="muted">NULL</span>
                              ) : (
                                String(value)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!table.sample_rows.length && (
                  <p className="muted">{t.emptyTable}</p>
                )}
                {table.foreign_keys.map((key, i) => (
                  <p className="relationship" key={i}>
                    {key.columns.join(", ")} → {key.target_table} (
                    {key.target_columns
                      .map((c) => c || t.primaryKeyFallback)
                      .join(", ")}
                    )
                  </p>
                ))}
              </details>
            </section>
          ))}
          <div className="import-notes">
            {preview.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            {preview.kind === "sqlite" && <p>{t.sqliteNote}</p>}
          </div>
          <div className="import-actions">
            <span>
              <Check size={15} /> {t.previewOnly}
            </span>
            <button
              className="primary"
              disabled={
                busy || !selected.length || !schema.trim() || !tableName.trim()
              }
            >
              {busy ? t.importingShort : t.importTables(selected.length)}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
