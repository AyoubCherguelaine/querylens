"use client";
import { useRef, useState } from "react";
import { Check, FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react";
import {
  upload,
  type ImportPreview,
  type Source,
  type SourceOverview,
} from "@/lib/api";

export function ImportData({
  limits,
  onComplete,
  onCancel,
}: {
  limits: SourceOverview["limits"];
  onComplete: (source: Source) => Promise<void>;
  onCancel: () => void;
}) {
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
      setError(
        `File exceeds the ${Math.floor(limits.max_bytes / 1024 / 1024)} MB limit.`,
      );
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
          <span className="eyebrow">NEW DATA SOURCE</span>
          <h2 id="import-title">Bring your data into the workspace</h2>
          <p className="muted">
            One file, one schema. Preview the tables before importing.
          </p>
        </div>
        <button
          className="icon-button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close import"
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
              ? "Inspecting your file…"
              : "Importing into PostgreSQL…"
            : file
              ? file.name
              : "Choose a file or drop it here"}
        </strong>
        <span>
          CSV or SQLite · up to {Math.floor(limits.max_bytes / 1024 / 1024)} MB
          · {limits.max_rows.toLocaleString()} rows total
        </span>
        <small>
          CSV needs a header row. SQLite supports multiple ordinary tables.
        </small>
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
              Schema name
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
                Table name
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
            Names use lowercase letters and underscores. Existing schemas are
            preserved; duplicates receive a suffix such as _2.
          </p>
          <div className="preview-title">
            <h3>
              Choose tables to import{" "}
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
                  ? "Deselect all"
                  : "Select all"}
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
                  {table.row_count.toLocaleString()} rows ·{" "}
                  {table.columns.length} columns
                </span>
              </label>
              <details open={preview.tables.length === 1}>
                <summary>
                  Preview fields and sample rows
                  {table.primary_key.length
                    ? ` · Primary key: ${table.primary_key.join(", ")}`
                    : ""}
                  {table.foreign_keys.length
                    ? ` · ${table.foreign_keys.length} foreign keys`
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
                  <p className="muted">
                    Empty table: column definitions will still be imported.
                  </p>
                )}
                {table.foreign_keys.map((key, i) => (
                  <p className="relationship" key={i}>
                    {key.columns.join(", ")} → {key.target_table} (
                    {key.target_columns
                      .map((c) => c || "primary key")
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
            {preview.kind === "sqlite" && (
              <p>
                Select referenced tables together. Constraint failures roll back
                the whole import.
              </p>
            )}
          </div>
          <div className="import-actions">
            <span>
              <Check size={15} /> Preview only. Nothing has been saved yet.
            </span>
            <button
              className="primary"
              disabled={
                busy || !selected.length || !schema.trim() || !tableName.trim()
              }
            >
              {busy
                ? "Importing…"
                : `Import ${selected.length} ${selected.length === 1 ? "table" : "tables"}`}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
