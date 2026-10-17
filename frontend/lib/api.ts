import { defaultLocale, dictionaries, isLocale } from "./i18n/dictionaries";

function errors() {
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
  return dictionaries[isLocale(lang) ? lang : defaultLocale].errors;
}

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
    kind?: "fact" | "entity" | "bridge" | "snapshot";
    description?: string;
    classification_reason?: string;
    time_dimensions?: string[];
    suggested_questions?: string[];
    joins?: { path: string; schema: string; table: string; cardinality: string; evidence: string }[];
    measures: { field: string | null; aggregation: string; label?: string; description?: string; additivity?: string }[];
    fields: { name: string; type: string; key: boolean; nullable: boolean; role?: string; description?: string }[];
    warnings: string[];
  };
};
export type AgentStep = {
  id: string;
  tool: string;
  status: "running" | "completed" | "failed";
  purpose?: string;
  arguments?: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration_ms?: number;
};
export type WrittenReport = {
  title: string;
  summary: string;
  sections: { heading: string; text: string }[];
  evidence: {
    id: string;
    sql: string;
    row_count?: number;
    truncated?: boolean;
    cells_truncated?: boolean;
    sample_only?: boolean;
    executed_at?: string;
  }[];
};
export type Result = {
  status: "answered" | "clarification" | "error" | "limit_reached";
  steps?: AgentStep[];
  answer: string;
  report?: WrittenReport;
  error?: { error: string; code: string; diagnostics?: Record<string, unknown> };
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
export async function askAgent(
  session: string,
  question: string,
  onStep: (step: AgentStep) => void,
): Promise<Result> {
  const response = await fetch(`/api/chat/session/${session}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, stream: true }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.detail || errors().agentStart);
  }
  if (!response.body) throw new Error(errors().agentStream);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "step") onStep(event.step);
        if (event.type === "result") return event.result;
        if (event.type === "error") throw new Error(event.detail);
      }
      if (done) throw new Error(errors().agentEnded);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
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
        : errors().invalid,
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
        : errors().importFailed,
    );
  return data;
}
