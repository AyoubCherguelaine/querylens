import { defaultLocale, dictionaries, isLocale } from "./i18n/dictionaries";

function errors() {
  const lang =
    typeof document === "undefined" ? "" : document.documentElement.lang;
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
    joins?: {
      path: string;
      schema: string;
      table: string;
      cardinality: string;
      evidence: string;
    }[];
    measures: {
      field: string | null;
      aggregation: string;
      label?: string;
      description?: string;
      additivity?: string;
    }[];
    fields: {
      name: string;
      type: string;
      key: boolean;
      nullable: boolean;
      role?: string;
      description?: string;
    }[];
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
export type ChartSource = {
  name: string;
  sql?: string;
  row_count: number;
  download_name: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  csv_data?: string;
  exported_at?: string;
};
export type ChartSpec = {
  title: string;
  chart_type: "bar" | "line" | "area" | "pie" | "scatter";
  description: string;
  x_key: string;
  y_keys: string[];
  z_key?: string | null;
  group_mode?: "grouped" | "stacked";
  x_label?: string;
  y_label?: string;
  z_label?: string;
  evidence_id: string;
  sql?: string;
  rows: Record<string, unknown>[];
  columns: { key: string; label: string }[];
  data_source: ChartSource;
};
export type ModelPricing = {
  input_per_million: number;
  output_per_million: number;
  cached_input_per_million?: number;
};

export type ModelItem = {
  id: string;
  provider: "openai";
  name: string;
  description: string;
  credit_cost: number;
  pricing?: ModelPricing;
  is_default: boolean;
};

export type ModelsConfig = {
  provider: "openai";
  description: string;
  models: ModelItem[];
};

export const DEFAULT_OPENAI_MODELS: ModelItem[] = [
  {
    id: "openai.gpt-oss-120b",
    provider: "openai",
    name: "Bedrock Mantle GPT-OSS 120B",
    description: "High performance 120B model via AWS Bedrock Mantle",
    credit_cost: 5,
    pricing: {
      input_per_million: 0.15,
      output_per_million: 0.6,
      cached_input_per_million: 0.075,
    },
    is_default: true,
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    name: "OpenAI GPT-4o-mini",
    description: "Fast and economical model for everyday analytics",
    credit_cost: 5,
    pricing: {
      input_per_million: 0.15,
      output_per_million: 0.6,
      cached_input_per_million: 0.075,
    },
    is_default: false,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    name: "OpenAI GPT-6 Luna",
    description: "Ultra-compact next-generation model for high-speed, cost-effective reasoning",
    credit_cost: 4,
    pricing: {
      input_per_million: 0.1,
      output_per_million: 0.5,
      cached_input_per_million: 0.01,
    },
    is_default: false,
  },
  {
    id: "gpt-5.6-luna",
    provider: "openai",
    name: "OpenAI GPT-5.6 Luna",
    description: "GPT-5.6 model optimized for cost-sensitive workloads",
    credit_cost: 8,
    pricing: {
      input_per_million: 0.2,
      output_per_million: 1.2,
      cached_input_per_million: 0.02,
    },
    is_default: false,
  },
  {
    id: "gpt-5.4-nano",
    provider: "openai",
    name: "OpenAI GPT-5.4 Nano",
    description: "Our fastest and cheapest GPT-5.4-class model for simple high-volume tasks",
    credit_cost: 8,
    pricing: {
      input_per_million: 0.2,
      output_per_million: 1.25,
      cached_input_per_million: 0.02,
    },
    is_default: false,
  },
  {
    id: "gpt-5-nano",
    provider: "openai",
    name: "OpenAI GPT-5 Nano",
    description: "Fastest, most cost-effective GPT-5 model",
    credit_cost: 2,
    pricing: {
      input_per_million: 0.05,
      output_per_million: 0.4,
      cached_input_per_million: 0.005,
    },
    is_default: false,
  },
  {
    id: "gpt-4.1-nano",
    provider: "openai",
    name: "OpenAI GPT-4.1 Nano",
    description: "Fastest, most cost-effective GPT-4.1 model",
    credit_cost: 3,
    pricing: {
      input_per_million: 0.1,
      output_per_million: 0.4,
      cached_input_per_million: 0.025,
    },
    is_default: false,
  },
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    name: "OpenAI GPT-4.1 Mini",
    description: "Balanced for intelligence, speed, and cost",
    credit_cost: 10,
    pricing: {
      input_per_million: 0.4,
      output_per_million: 1.6,
      cached_input_per_million: 0.1,
    },
    is_default: false,
  },
  {
    id: "gpt-4o",
    provider: "openai",
    name: "OpenAI GPT-4o",
    description: "Advanced multi-step reasoning and deep analytical queries",
    credit_cost: 15,
    pricing: {
      input_per_million: 2.5,
      output_per_million: 10.0,
      cached_input_per_million: 1.25,
    },
    is_default: false,
  },
  {
    id: "gpt-4-turbo",
    provider: "openai",
    name: "OpenAI GPT-4 Turbo",
    description: "High context capacity with comprehensive SQL verification",
    credit_cost: 20,
    pricing: {
      input_per_million: 10.0,
      output_per_million: 30.0,
    },
    is_default: false,
  },
  {
    id: "o1-mini",
    provider: "openai",
    name: "OpenAI o1-mini",
    description: "Deep mathematical reasoning and complex schema logic",
    credit_cost: 25,
    pricing: {
      input_per_million: 1.1,
      output_per_million: 4.4,
      cached_input_per_million: 0.55,
    },
    is_default: false,
  },
  {
    id: "o3-mini",
    provider: "openai",
    name: "OpenAI o3-mini",
    description: "Next-generation high-precision STEM analytical reasoning",
    credit_cost: 30,
    pricing: {
      input_per_million: 1.1,
      output_per_million: 4.4,
      cached_input_per_million: 0.55,
    },
    is_default: false,
  },
];

export function getModelCreditCost(
  modelId?: string,
  availableModels?: ModelItem[],
): number {
  const models =
    availableModels && availableModels.length > 0
      ? availableModels
      : DEFAULT_OPENAI_MODELS;
  const match = models.find((m) => m.id === modelId);
  return match ? match.credit_cost : 5;
}

export type ModelSettings = {
  model: string;
  process_mode: "standard" | "fast" | "deep_analytical";
  temperature: number;
  max_steps: number;
  custom_instructions: string;
};

export type CreditTransaction = {
  id: string;
  amount: number;
  action: string;
  balance_after: number;
  created_at: string;
};

export type CreditSummary = {
  credits: number;
  question_cost: number;
  new_data_cost: number;
  transactions: CreditTransaction[];
};

export type UserInfo = {
  id: string;
  email: string;
  full_name: string;
  credits: number;
  model_settings: ModelSettings;
};

export type VerificationProof = {
  score: number;
  grade: "high" | "medium" | "low";
  assumptions: string[];
  caveats: string[];
  verified_filters?: { field: string; operator: string; value: string }[];
  proof_of_work?: {
    ast_verified: boolean;
    read_only_enforced: boolean;
    tables_scanned: string[];
    execution_mode: string;
  };
};

export type Result = {
  status: "answered" | "clarification" | "error" | "limit_reached";
  steps?: AgentStep[];
  answer: string;
  report?: WrittenReport;
  chart?: ChartSpec;
  error?: {
    error: string;
    code: string;
    diagnostics?: Record<string, unknown>;
  };
  rows?: Record<string, unknown>[];
  columns?: { key: string; label: string }[];
  sql?: string;
  parameters?: unknown[];
  truncated?: boolean;
  duration_ms?: number;
  executed_at?: string;
  warnings?: string[];
  plan?: unknown;
  credits_remaining?: number;
  credits_spent?: number;
  model_used?: string;
  confidence_score?: number;
  confidence_grade?: "high" | "medium" | "low";
  assumptions?: string[];
  caveats?: string[];
  verification?: VerificationProof;
};
export type Message = { id: string; question: string; result: Result };
export type Session = {
  id: string;
  cube_id: string;
  cube_ids?: string[];
  created_at: string;
};
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
      // A valid final NDJSON record may arrive without a trailing newline.
      if (done && buffer.trim()) {
        lines.push(buffer);
        buffer = "";
      }
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
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string" ? data.detail : errors().invalid,
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
  kind: "csv" | "sqlite" | "excel";
  suggested_schema: string;
  tables: ImportTable[];
  sha256: string;
  warnings: string[];
};
export type Source = {
  id: string;
  name: string;
  schema_name: string;
  kind: "csv" | "sqlite" | "excel" | "existing";
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
      typeof data.detail === "string" ? data.detail : errors().importFailed,
    );
  return data;
}

export async function deleteSource(
  id: string,
): Promise<{ status: string; id: string }> {
  return api<{ status: string; id: string }>(`sources/${id}`, undefined, "DELETE");
}

export async function deleteChatSession(
  id: string,
): Promise<{ status: string; id: string }> {
  return api<{ status: string; id: string }>(`chat/session/${id}`, undefined, "DELETE");
}

export async function suggestTables(
  question: string,
  source_id: string,
): Promise<{ cube_ids: string[]; reasoning: string }> {
  return api<{ cube_ids: string[]; reasoning: string }>(
    "cubes/suggest-tables",
    { question, source_id },
  );
}

export type DashboardCardType = "chart" | "report" | "table" | "metric";

export type DashboardCard = {
  id: string;
  title: string;
  card_type: DashboardCardType;
  content: any;
  query_text?: string;
  source_id?: string;
  cube_id?: string;
  session_id?: string;
  layout_order: number;
  created_at?: string;
};

export type DashboardCardCreatePayload = {
  title: string;
  card_type: DashboardCardType;
  content: any;
  query_text?: string;
  source_id?: string;
  cube_id?: string;
  session_id?: string;
  layout_order?: number;
};

const LOCAL_STORAGE_PINS_KEY = "querylens_dashboard_pins_v1";

export async function fetchDashboardCards(): Promise<DashboardCard[]> {
  try {
    const cards = await api<DashboardCard[]>("dashboards/cards");
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(LOCAL_STORAGE_PINS_KEY, JSON.stringify(cards));
      } catch (_) {}
    }
    return cards;
  } catch (err) {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_PINS_KEY);
        if (stored) return JSON.parse(stored);
      } catch (_) {}
    }
    return [];
  }
}

export async function pinDashboardCard(payload: DashboardCardCreatePayload): Promise<DashboardCard> {
  try {
    const card = await api<DashboardCard>("dashboards/cards", payload);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_PINS_KEY);
        const list: DashboardCard[] = stored ? JSON.parse(stored) : [];
        const updated = [card, ...list.filter((c) => c.id !== card.id)];
        localStorage.setItem(LOCAL_STORAGE_PINS_KEY, JSON.stringify(updated));
      } catch (_) {}
    }
    return card;
  } catch (err) {
    const localCard: DashboardCard = {
      id: "local-" + Math.random().toString(36).slice(2, 11),
      title: payload.title,
      card_type: payload.card_type,
      content: payload.content,
      query_text: payload.query_text,
      source_id: payload.source_id,
      cube_id: payload.cube_id,
      session_id: payload.session_id,
      layout_order: payload.layout_order ?? 0,
      created_at: new Date().toISOString(),
    };
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_PINS_KEY);
        const list: DashboardCard[] = stored ? JSON.parse(stored) : [];
        const updated = [localCard, ...list];
        localStorage.setItem(LOCAL_STORAGE_PINS_KEY, JSON.stringify(updated));
      } catch (_) {}
    }
    return localCard;
  }
}

export async function deleteDashboardCard(id: string): Promise<void> {
  try {
    await api(`dashboards/cards/${id}`, undefined, "DELETE");
  } catch (_) {}
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_PINS_KEY);
      if (stored) {
        const list: DashboardCard[] = JSON.parse(stored);
        localStorage.setItem(
          LOCAL_STORAGE_PINS_KEY,
          JSON.stringify(list.filter((c) => c.id !== id)),
        );
      }
    } catch (_) {}
  }
}

export async function updateDashboardCard(
  id: string,
  updates: { title?: string; layout_order?: number },
): Promise<DashboardCard | null> {
  let updatedCard: DashboardCard | null = null;
  try {
    updatedCard = await api<DashboardCard>(`dashboards/cards/${id}`, updates, "PATCH");
  } catch (_) {}

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_PINS_KEY);
      if (stored) {
        const list: DashboardCard[] = JSON.parse(stored);
        const nextList = list.map((c) => {
          if (c.id === id) {
            return {
              ...c,
              ...(updates.title !== undefined ? { title: updates.title } : {}),
              ...(updates.layout_order !== undefined ? { layout_order: updates.layout_order } : {}),
            };
          }
          return c;
        });
        localStorage.setItem(LOCAL_STORAGE_PINS_KEY, JSON.stringify(nextList));
        if (!updatedCard) {
          updatedCard = nextList.find((c) => c.id === id) || null;
        }
      }
    } catch (_) {}
  }
  return updatedCard;
}

