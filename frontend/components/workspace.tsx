"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Box,
  ChevronRight,
  Database,
  FolderOpen,
  MessageSquare,
  Upload,
  Layers3,
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
import { ChatSidebar } from "./chat-sidebar";
import { SchemaSidebar } from "./schema-sidebar";
import { ImportData } from "./import-data";
import { SourceDashboard } from "./source-dashboard";
import { useRouter } from "next/navigation";
import { AnalysisResult } from "./result";
import { AgentSteps } from "./agent-steps";

export function Workspace() {
  const router = useRouter();
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
  const [view, setView] = useState<"dashboard" | "analysis" | "upload">(
    "analysis",
  );
  const [loadingData, setLoadingData] = useState(true);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const conversation = useRef<HTMLDivElement>(null);
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
    setLoadingData(true);
    try {
      const [list, history, sourceData] = await Promise.all([
        api<Cube[]>("cubes"),
        api<Session[]>("chat/sessions"),
        api<SourceOverview>("sources"),
      ]);
      setCubes(list);
      setOverview(sourceData);
      const sourceId = sourceData.sources.some(
        (source) => source.id === selectedSource,
      )
        ? selectedSource
        : list[0]?.source_id || sourceData.sources[0]?.id || "";
      setSelectedSource(sourceId);
      setSessions(history);
      setSelected((previous) =>
        list.some((c) => c.id === previous && c.source_id === sourceId)
          ? previous
          : list.find((c) => c.source_id === sourceId)?.id || "",
      );
      return { cubes: list, sources: sourceData.sources };
    } finally {
      setLoadingData(false);
    }
  }
  function openSource(id: string, availableCubes = cubes) {
    setRightOpen(false);
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
      .catch(() => {
        setAuthenticated(false);
        router.replace("/login");
      });
  }, []);
  useEffect(() => {
    const panel = conversation.current;
    if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
  }, [messages, busy, agentSteps]);
  useEffect(() => {
    const resetDrawers = () => {
      setLeftOpen(false);
      setRightOpen(false);
    };
    window.addEventListener("resize", resetDrawers);
    return () => window.removeEventListener("resize", resetDrawers);
  }, []);
  useEffect(() => {
    if (!leftOpen && !rightOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.getElementById(
      leftOpen ? "chat-sidebar" : "schema-sidebar",
    );
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select:not(:disabled), [tabindex="0"]',
        ) || [],
      ).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLeftOpen(false);
        setRightOpen(false);
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [leftOpen, rightOpen]);
  function choose(id: string) {
    setRightOpen(false);
    setLeftOpen(false);
    setTab("analysis");
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
      setLeftOpen(false);
      setQuestion("");
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
    setPendingQuestion(text);
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
            ? previous.map((item) => (item.id === step.id ? step : item))
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
      setPendingQuestion("");
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
  async function signOut() {
    try {
      await api("logout", {});
      setAuthenticated(false);
      router.replace("/");
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

      setLeftOpen(false);
      setRightOpen(false);
      setError("");
    } catch (error) {
      setError((error as Error).message);
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
      <main className="loading-screen" role="status">
        Opening sign in…
      </main>
    );
  return (
    <div className="workspace">
      {(leftOpen || rightOpen) && (
        <button
          className="panel-backdrop"
          tabIndex={-1}
          aria-label="Close sidebar"
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        />
      )}
      <ChatSidebar
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        busy={busy}
        cubes={cubes}
        sessions={sessions}
        session={session}
        onClose={() => setLeftOpen(false)}
        onNewChat={() => choose(selected)}
        onOpenSession={openSession}
        onSignOut={signOut}
      />
      <main className="main-panel" inert={leftOpen || rightOpen}>
        <header className="topbar">
          <div className="workspace-crumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open chats"
              aria-expanded={leftOpen}
              aria-controls="chat-sidebar"
              onClick={() => {
                setLeftOpen(!leftOpen);
                setRightOpen(false);
              }}
            >
              <MessageSquare size={19} />
            </button>
            <span className="desktop-crumb">
              Workspace <ChevronRight size={14} />
            </span>
            <strong>
              {view === "dashboard"
                ? "Data sources"
                : view === "upload"
                  ? "Upload data"
                  : "Analysis"}
            </strong>
          </div>
          <nav className="workspace-nav" aria-label="Workspace navigation">
            <button
              className={view === "analysis" ? "active" : ""}
              aria-current={view === "analysis" ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setView("analysis");
                setTab("analysis");
              }}
            >
              <Sparkles size={15} />
              <span>Chat</span>
            </button>
            <button
              className={view === "dashboard" ? "active" : ""}
              aria-current={view === "dashboard" ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setView("dashboard");
                setError("");
              }}
            >
              <FolderOpen size={15} />
              <span>Sources</span>
            </button>
            <button
              className={view === "upload" ? "active" : ""}
              aria-current={view === "upload" ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setView("upload");
                setError("");
              }}
            >
              <Upload size={15} />
              <span>Upload</span>
            </button>
          </nav>
          <button
            className="schema-toggle secondary"
            aria-label="Open schemas"
            aria-expanded={rightOpen}
            aria-controls="schema-sidebar"
            onClick={() => {
              setRightOpen(!rightOpen);
              setLeftOpen(false);
            }}
          >
            <Database size={16} />
            <span>Schemas</span>
          </button>
        </header>
        <div
          className={`page-content ${view === "analysis" ? "analysis-content" : ""}`}
        >
          {loadingData ? (
            <div className="workspace-loading" role="status">
              <RefreshCw size={24} className="spin" />
              <h2>Preparing your workspace</h2>
              <p>Loading your schemas and conversations…</p>
            </div>
          ) : view === "upload" ? (
            <ImportData
              limits={overview.limits}
              onCancel={() => setView("dashboard")}
              onComplete={sourceComplete}
            />
          ) : view === "dashboard" ? (
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
                  <h1>Let’s find your next insight.</h1>
                  <p className="muted">
                    {activeSource
                      ? `Exploring ${activeSource.schema_name}. Ask a question and follow the evidence.`
                      : "Connect a source, choose a table, and start a conversation."}
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
                  <h2>
                    {selectedSource
                      ? "No tables are available in this source"
                      : "Good questions start with your data."}
                  </h2>
                  <p>
                    {selectedSource
                      ? "Discover tables in this source, or choose another schema in the right sidebar."
                      : "Upload a dataset or connect a PostgreSQL schema to start exploring. Your chats live on the left, and your schemas on the right."}
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      selectedSource ? void discover() : setView("upload")
                    }
                    disabled={busy}
                  >
                    {selectedSource ? "Discover tables" : "Upload your data"}{" "}
                    <ArrowUp size={16} />
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
                      <span className="tag">
                        {cube.definition.kind
                          ? `${cube.definition.kind} cube`
                          : "Source cube"}
                      </span>
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
                          <p className="muted">
                            These declared relationships preserve this cube’s
                            grain. Related amounts stay in their own cubes.
                          </p>
                          {cube.definition.joins.map((join) => (
                            <p className="relationship" key={join.path}>
                              <strong>{join.path}</strong> → {join.schema}.
                              {join.table} · many to one
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
                                <td>
                                  {f.role?.replaceAll("_", " ") ||
                                    (f.key ? "identifier" : "dimension")}
                                </td>
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
                            model related dimensions when they preserve the
                            cube’s grain.
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
                          {cube.definition.suggested_questions.map(
                            (suggestion) => (
                              <button
                                className="secondary"
                                key={suggestion}
                                disabled={busy}
                                onClick={() => {
                                  setQuestion(suggestion);
                                  setTab("analysis");
                                }}
                              >
                                {suggestion}
                              </button>
                            ),
                          )}
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
                      <div className="conversation" ref={conversation}>
                        {!messages.length && !pendingQuestion ? (
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
                              <button
                                disabled={busy}
                                onClick={() =>
                                  setQuestion(
                                    "Write a readable analysis of this source: summarize the main findings, explain useful comparisons, and state data limitations.",
                                  )
                                }
                              >
                                <Sparkles size={17} />
                                <span>
                                  Write an analysis
                                  <small>
                                    Turn data into a readable report
                                  </small>
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
                                  disabled={busy}
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
                        {pendingQuestion && (
                          <div className="question pending-question">
                            <span className="user-avatar">You</span>
                            <p>{pendingQuestion}</p>
                          </div>
                        )}
                        {busy && (
                          <div role="status" className="working">
                            <span className="dot" /> Working on your analysis…
                          </div>
                        )}
                        <AgentSteps steps={agentSteps} />
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
                              if (
                                e.key === "Enter" &&
                                !e.shiftKey &&
                                !e.nativeEvent.isComposing
                              ) {
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
      <SchemaSidebar
        key={selectedSource}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        busy={busy}
        overview={overview}
        selectedSource={selectedSource}
        sourceCubes={sourceCubes}
        selected={selected}
        cube={cube}
        onClose={() => setRightOpen(false)}
        onSourceChange={openSource}
        onChooseTable={choose}
        onDiscover={discover}
        onViewSchema={() => {
          setView("analysis");
          setTab("schema");
        }}
        onUpload={() => setView("upload")}
      />
    </div>
  );
}
