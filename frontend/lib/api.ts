export type Cube = {
  id: string;
  source_id: string;
  definition: {
    name: string;
    schema: string;
    table: string;
    grain: string;
    estimated_rows: number;
    dimensions: string[];
    measures: { field: string | null; aggregation: string }[];
    fields: { name: string; type: string; key: boolean; nullable: boolean }[];
    warnings: string[];
  };
};
export type Result = {
  status: "answered" | "clarification";
  answer: string;
  rows?: Record<string, unknown>[];
  columns?: { key: string; label: string }[];
  sql?: string;
  parameters?: unknown[];
  truncated?: boolean;
  duration_ms?: number;
  executed_at?: string;
  warnings?: string[];
  plan?: unknown;
};
export type Message = { id: string; question: string; result: Result };
export type Session = { id: string; cube_id: string; created_at: string };
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Please check the submitted values.",
    );
  return data;
}

export type ForeignKey = {
  columns: string[];
  target_table: string;
  target_columns: (string | null)[];
  on_update: string;
  on_delete: string;
};
export type ImportTable = {
  original_name: string;
  name: string;
  columns: {
    name: string;
    original_name: string;
    type: string;
    nullable: boolean;
  }[];
  row_count: number;
  primary_key: string[];
  unique_keys: string[][];
  foreign_keys: ForeignKey[];
  sample_rows: unknown[][];
};
export type ImportPreview = {
  filename: string;
  kind: "csv" | "sqlite";
  suggested_schema: string;
  tables: ImportTable[];
  sha256: string;
  warnings: string[];
};
export type Source = {
  id: string;
  name: string;
  schema_name: string;
  kind: "csv" | "sqlite" | "existing";
  filename: string | null;
  created_at: string;
  table_count?: number;
  manifest: { tables?: ImportTable[]; warnings?: string[] };
};
export type SourceOverview = {
  sources: Source[];
  available_schemas: { schema_name: string; table_count: number }[];
  warning: string | null;
  limits: {
    max_bytes: number;
    max_rows: number;
    max_tables: number;
    max_columns: number;
  };
};
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Could not import this file. Check its format and values.",
    );
  return data;
}
