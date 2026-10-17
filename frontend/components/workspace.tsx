"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Box,
  ChevronRight,
  Database,
  FolderOpen,
  History,
  Layers3,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles,
  Table2,
} from "lucide-react";
import {
  api,
  askAgent,
  type AgentStep,
  type Cube,
  type Message,
  type Result,
  type Session,
  type Source,
  type SourceOverview,
} from "@/lib/api";
import { SourceDashboard } from "./source-dashboard";
import { AuthForm } from "./auth-form";
import { AnalysisResult } from "./result";
import { AgentSteps } from "./agent-steps";

export function Workspace() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [cubes, setCubes] = useState<Cube[]>([]),
    [selected, setSelected] = useState(""),
    [session, setSession] = useState(""),
    [sessions, setSessions] = useState<Session[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"analysis" | "schema">("analysis");
  const [view, setView] = useState<"dashboard" | "analysis">("dashboard");
  const [selectedSource, setSelectedSource] = useState("");
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [overview, setOverview] = useState<SourceOverview>({
    sources: [],
    available_schemas: [],
    warning: null,
    limits: {
      max_bytes: 25 * 1024 * 1024,
      max_rows: 100000,
      max_tables: 50,
      max_columns: 128,
    },
  });
  const activeSource = overview.sources.find(
    (source) => source.id === selectedSource,
  );
  const sourceCubes = cubes.filter((c) => c.source_id === selectedSource);
  const end = useRef<HTMLDivElement>(null);
  const cube = cubes.find((c) => c.id === selected);
  const importedTable = activeSource?.manifest.tables?.find(
    (table) => table.name === cube?.definition.table,
  );
  const suggestedDimension =
    cube?.definition.dimensions.find(
      (name) =>
        !cube.definition.fields.find((field) => field.name === name)?.key &&
        name !== "id",
    ) || cube?.definition.dimensions[0];
  async function load() {
    const [list, history, sourceData] = await Promise.all([
      api<Cube[]>("cubes"),
      api<Session[]>("chat/sessions"),
      api<SourceOverview>("sources"),
    ]);
    setCubes(list);
    setOverview(sourceData);
    setSessions(history);
    setSelected((previous) =>
      list.some((c) => c.id === previous) ? previous : "",
    );
    return { cubes: list, sources: sourceData.sources };
  }
  function openSource(id: string, availableCubes = cubes) {
    setSelectedSource(id);
    setSelected(availableCubes.find((c) => c.source_id === id)?.id || "");
    setSession("");
    setMessages([]);
    setQuestion("");
    setError("");
    setTab("analysis");
    setView("analysis");
  }
  async function sourceComplete(source: Source) {
    const latest = await load();
    openSource(source.id, latest.cubes);
  }
  useEffect(() => {
    api("users/me")
      .then(() => {
        setAuthenticated(true);
        void load().catch((error) => setError((error as Error).message));
      })
      .catch(() => setAuthenticated(false));
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, agentSteps]);
  function choose(id: string) {
    setView("analysis");
    setSelectedSource(
      cubes.find((c) => c.id === id)?.source_id || selectedSource,
    );
    setQuestion("");
    setSelected(id);
    setSession("");
    setMessages([]);
    setError("");
  }
  async function discover() {
    setBusy(true);
    setError("");
    try {
      if (selectedSource) await api(`sources/${selectedSource}/discover`, {});
      else await api("cubes/discover", {});
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openSession(item: Session) {
    setBusy(true);
    setError("");
    try {
      const history = await api<{ messages: Message[] }>(
        `chat/session/${item.id}`,
      );
      setSelected(item.cube_id);
      setSelectedSource(
        cubes.find((c) => c.id === item.cube_id)?.source_id || "",
      );
      setView("analysis");
      setSession(item.id);
      setMessages(history.messages);
      setTab("analysis");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !question.trim() || !cube) return;
    setBusy(true);
    setAgentSteps([]);
    setError("");
    const text = question.trim();
    try {
      let id = session;
      if (!id) {
        const created = await api<{ id: string }>("chat/session", {
          cube_id: selected,
        });
        id = created.id;
        setSession(id);
      }
      const result = await askAgent(id, text, (step) => {
        setAgentSteps((previous) => {
          const found = previous.some((item) => item.id === step.id);
          return found
            ? previous.map((item) => item.id === step.id ? step : item)
            : [...previous, step];
        });
      });
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), question: text, result },
      ]);
      setQuestion("");
      setAgentSteps([]);
      setSessions(await api<Session[]>("chat/sessions"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function countRows() {
    if (!cube) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Result>(`cubes/${cube.id}/analyze`, {
        plan: {
          clarification: null,
          groups: [],
          metrics: [{ field: null, aggregation: "count" }],
          filters: [],
          order_by: null,
          descending: false,
          limit: 1,
        },
      });
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          question: "Count all rows (direct analysis)",
          result,
        },
      ]);
      setTab("analysis");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function profile() {
    if (!cube) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Result>(`cubes/${cube.id}/profile`, {});
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), question: "Profile source data", result },
      ]);
      setTab("analysis");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (authenticated === null)
    return (
      <main className="loading-screen" role="status">
        Connecting to your workspace…
      </main>
    );
  if (!authenticated)
    return (
      <AuthForm
        onSuccess={() => {
          setAuthenticated(true);
          load().catch((e) => setError(e.message));
        }}
      />
    );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Database size={19} />
          </span>
          cube<span className="muted">/</span>chat
        </div>
        <div className="workspace-label">
          <span className="workspace-avatar">A</span>
          <div>
            Analytics workspace<small>PostgreSQL explorer</small>
          </div>
        </div>
        <div className="section-label">WORKSPACE</div>
        <button
          className={`nav-item dashboard-nav ${view === "dashboard" ? "active" : ""}`}
          disabled={busy}
          onClick={() => {
            setView("dashboard");
            setError("");
          }}
        >
          <FolderOpen size={18} />
          Data sources<span>{overview.sources.length}</span>
        </button>
        <button
          className={`nav-item ${view === "analysis" ? "active" : ""}`}
          disabled={busy || !selectedSource}
          onClick={() => {
            setView("analysis");
            setTab("analysis");
          }}
        >
          <Layers3 size={18} />
          Cube explorer<span>{sourceCubes.length}</span>
        </button>
        <label className="source-selector">
          ACTIVE SOURCE
          <select
            aria-label="Active data source"
            value={selectedSource}
            disabled={busy}
            onChange={(e) =>
              e.target.value ? openSource(e.target.value) : setView("dashboard")
            }
          >
            <option value="">Choose a source</option>
            {overview.sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.schema_name}
              </option>
            ))}
          </select>
        </label>
        <div className="section-label cube-label">
          SOURCE TABLES
          <button
            className="icon-button"
            title="Discover cubes"
            disabled={busy}
            onClick={discover}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="cube-list">
          {sourceCubes.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              className={`cube-item ${selected === c.id ? "selected" : ""}`}
              onClick={() => choose(c.id)}
            >
              <Box size={16} />
              <span>
                {c.definition.name}
                <small>
                  {c.definition.schema}.{c.definition.table}
                </small>
              </span>
              {selected === c.id && <ChevronRight size={14} />}
            </button>
          ))}
          {!sourceCubes.length && (
            <p className="sidebar-hint">
              Choose a source from the dashboard to explore its tables.
            </p>
          )}
        </div>
        <div className="section-label">
          <History size={13} /> RECENT ANALYSES
        </div>
        <div className="session-list">
          {sessions.slice(0, 8).map((s) => (
            <button disabled={busy} key={s.id} onClick={() => openSession(s)}>
              {cubes.find((c) => c.id === s.cube_id)?.definition.name ||
                "Analysis"}
              <small>{new Date(s.created_at).toLocaleDateString()}</small>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <span>
            <span className="dot" /> PostgreSQL source
          </span>
          <button
            className="icon-button"
            aria-label="Sign out"
            disabled={busy}
            onClick={async () => {
              await api("logout", {});
              setAuthenticated(false);
              setMessages([]);
              setSession("");
              setCubes([]);
              setSelected("");
              setQuestion("");
              setOverview((previous) => ({
                ...previous,
                sources: [],
                available_schemas: [],
              }));
              setSelectedSource("");
              setView("dashboard");
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            <strong>
              {view === "dashboard"
                ? "Data sources"
                : activeSource?.schema_name || "Cube explorer"}
            </strong>
          </span>
          <span className="source-badge">
            <span className="dot" /> PostgreSQL
          </span>
        </header>
        <div className="page-content">
          {view === "dashboard" ? (
            <>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <SourceDashboard
                overview={overview}
                onOpen={openSource}
                onComplete={sourceComplete}
                onRefresh={async () => {
                  await load();
                }}
              />
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">EXPLORE WITH CONFIDENCE</span>
                  <h1>Your data, in perspective.</h1>
                  <p className="muted">
                    Source: {activeSource?.schema_name}. Choose a table and
                    follow the evidence.
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={discover}
                >
                  <RefreshCw size={15} className={busy ? "spin" : ""} />
                  Discover cubes
                </button>
              </div>
              {!cube ? (
                <section className="empty-card">
                  <Database size={38} />
                  <h2>No tables are available in this source</h2>
                  <p>
                    Refresh the source to discover its current tables, or open
                    the data source dashboard to import another dataset.
                  </p>
                  <button
                    className="primary"
                    onClick={discover}
                    disabled={busy}
                  >
                    Discover cubes <ArrowUp size={16} />
                  </button>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                </section>
              ) : (
                <>
                  <div className="cube-overview">
                    <div className="cube-title">
                      <span className="cube-symbol">
                        <Box size={25} />
                      </span>
                      <div>
                        <h2>{cube.definition.name}</h2>
                        <p>
                          {cube.definition.schema}.{cube.definition.table}
                        </p>
                      </div>
                      <span className="tag">{cube.definition.kind ? `${cube.definition.kind} cube` : "Source cube"}</span>
                    </div>
                    <div className="cube-stats">
                      <div>
                        <span>Dimensions</span>
                        <strong>{cube.definition.dimensions.length}</strong>
                      </div>
                      <div>
                        <span>Candidate measures</span>
                        <strong>{cube.definition.measures.length}</strong>
                      </div>
                      <div>
                        <span>Estimated rows</span>
                        <strong>
                          ~{cube.definition.estimated_rows.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="tabs">
                    <button
                      className={tab === "analysis" ? "active" : ""}
                      onClick={() => setTab("analysis")}
                    >
                      <Sparkles size={16} />
                      Analysis
                    </button>
                    <button
                      className={tab === "schema" ? "active" : ""}
                      onClick={() => setTab("schema")}
                    >
                      <Table2 size={16} />
                      Schema & measures
                    </button>
                    <button
                      className="new-analysis"
                      disabled={busy}
                      onClick={() => choose(selected)}
                    >
                      <Plus size={15} />
                      New analysis
                    </button>
                  </div>
                  {error && tab === "schema" && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  {tab === "schema" ? (
                    <section className="schema-card">
                      <div className="profile-heading">
                        <h3>Business model</h3>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={profile}
                        >
                          Profile data quality
                        </button>
                      </div>
                      <p>{cube.definition.description}</p>
                      <p className="muted">{cube.definition.grain}</p>
                      {!!cube.definition.joins?.length && (
                        <div className="source-relationships">
                          <h3>Related dimensions</h3>
                          <p className="muted">These declared relationships preserve this cube’s grain. Related amounts stay in their own cubes.</p>
                          {cube.definition.joins.map((join) => (
                            <p className="relationship" key={join.path}>
                              <strong>{join.path}</strong> → {join.schema}.{join.table} · many to one
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>PostgreSQL type</th>
                              <th>Business role</th>
                              <th>Nullable</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cube.definition.fields.map((f) => (
                              <tr key={f.name}>
                                <td>{f.name}</td>
                                <td>
                                  <code>{f.type}</code>
                                </td>
                                <td>{f.role?.replaceAll("_", " ") || (f.key ? "identifier" : "dimension")}</td>
                                <td>{f.nullable ? "Yes" : "No"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <h3>Candidate measures</h3>
                      <div className="chips">
                        {cube.definition.measures.map((m, i) => (
                          <span className="tag" key={i} title={m.description}>
                            {m.label || `${m.aggregation}(${m.field || "*"})`}
                          </span>
                        ))}
                      </div>
                      {!!importedTable?.foreign_keys.length && (
                        <div className="source-relationships">
                          <h3>Imported relationships</h3>
                          <p className="muted">
                            These keys are preserved in PostgreSQL and used to
                            model related dimensions when they preserve the cube’s grain.
                          </p>
                          {importedTable.foreign_keys.map((key, index) => (
                            <p className="relationship" key={index}>
                              {key.columns.join(", ")} → {key.target_table} (
                              {key.target_columns.join(", ")})
                            </p>
                          ))}
                        </div>
                      )}
                      {!!cube.definition.suggested_questions?.length && (
                        <div>
                          <h3>Explore this model</h3>
                          {cube.definition.suggested_questions.map((suggestion) => (
                            <button className="secondary" key={suggestion} disabled={busy}
                              onClick={() => { setQuestion(suggestion); setTab("analysis"); }}>
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                      {cube.definition.warnings.map((w) => (
                        <p className="notice" key={w}>
                          {w}
                        </p>
                      ))}
                    </section>
                  ) : (
                    <section className="analysis-panel">
                      <div className="conversation">
                        {!messages.length ? (
                          <div className="conversation-empty">
                            <span className="sparkle">
                              <Sparkles size={26} />
                            </span>
                            <h2>What would you like to understand?</h2>
                            <p>
                              Explore <strong>{cube.definition.name}</strong>{" "}
                              with a question about its fields.
                              <br />
                              Every result includes the executed query and
                              source evidence.
                            </p>
                            <div className="suggestions">
                              <button disabled={busy} onClick={() => setQuestion(
                                "Write a readable analysis of this source: summarize the main findings, explain useful comparisons, and state data limitations."
                              )}>
                                <Sparkles size={17} />
                                <span>
                                  Write an analysis
                                  <small>Turn data into a readable report</small>
                                </span>
                                <ChevronRight size={16} />
                              </button>
                              <button disabled={busy} onClick={countRows}>
                                <Table2 size={17} />
                                <span>
                                  Count all rows
                                  <small>Run directly, no model needed</small>
                                </span>
                                <ChevronRight size={16} />
                              </button>
                              {suggestedDimension && (
                                <button
                                  onClick={() =>
                                    setQuestion(
                                      `Count rows by ${suggestedDimension}`,
                                    )
                                  }
                                >
                                  <Layers3 size={17} />
                                  <span>
                                    Compare by dimension
                                    <small>{suggestedDimension}</small>
                                  </span>
                                  <ChevronRight size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          messages.map((m) => (
                            <div className="exchange" key={m.id}>
                              <div className="question">
                                <span className="user-avatar">You</span>
                                <p>{m.question}</p>
                              </div>
                              <AnalysisResult result={m.result} />
                            </div>
                          ))
                        )}
                        {busy && (
                          <div role="status" className="working">
                            <span className="dot" /> Working on your analysis…
                          </div>
                        )}
                        <AgentSteps steps={agentSteps} />
                        <div ref={end} />
                      </div>
                      <div className="composer-wrap">
                        {error && (
                          <p className="error" role="alert">
                            {error}
                          </p>
                        )}
                        <form className="composer" onSubmit={ask}>
                          <label className="sr-only" htmlFor="question">
                            Ask about this cube
                          </label>
                          <textarea
                            id="question"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            disabled={busy}
                            maxLength={2000}
                            placeholder={`Ask a question about ${cube.definition.name.toLowerCase()}…`}
                            rows={2}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                e.currentTarget.form?.requestSubmit();
                              }
                            }}
                          />
                          <div className="composer-footer">
                            <span>
                              <Box size={13} />
                              {cube.definition.name}
                            </span>
                            <button
                              className="send-button"
                              type="submit"
                              disabled={busy || !question.trim()}
                              aria-label="Send question"
                            >
                              <ArrowUp size={18} />
                            </button>
                          </div>
                        </form>
                        <p className="composer-note">
                          Answers come from query results. Review the plan and
                          metric meaning before making decisions.
                        </p>
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
