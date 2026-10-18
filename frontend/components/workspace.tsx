"use client";
import { Button } from "@/components/ui/button";
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
import { ChatThread } from "./ai-elements/chat-thread";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "./ui/input-group";
import { useT } from "@/lib/i18n/client";

export function Workspace() {
  const router = useRouter();
  const { t: dictionary, intl } = useT();
  const t = dictionary.workspace;
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
  const messageSequence = useRef(0);
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
  function appendMessage(question: string, result: Result) {
    const message = {
      id: `local-${++messageSequence.current}`,
      question,
      result,
    };
    setMessages((previous) => [...previous, message]);
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !question.trim() || !cube) return;
    setBusy(true);
    setAgentSteps([]);
    setError("");
    const text = question.trim();
    setPendingQuestion(text);
    setQuestion("");
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
      appendMessage(text, result);
      setAgentSteps([]);
      // Refreshing the sidebar must not turn a delivered answer into a chat error.
      void api<Session[]>("chat/sessions")
        .then(setSessions)
        .catch(() => {});
    } catch (e) {
      setQuestion((draft) => draft || text);
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
      appendMessage(t.countRowsQuestion, result);
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
      appendMessage(t.profileQuestion, result);
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
        {t.connecting}
      </main>
    );
  if (!authenticated)
    return (
      <main className="loading-screen" role="status">
        {t.openingSignIn}
      </main>
    );
  return (
    <div className="workspace">
      {(leftOpen || rightOpen) && (
        <Button
          variant="ghost"
          size="plain"
          className="panel-backdrop"
          tabIndex={-1}
          aria-label={t.closeSidebar}
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
            <Button
              variant="ghost"
              size="plain"
              className="icon-button mobile-toggle"
              aria-label={t.openChats}
              aria-expanded={leftOpen}
              aria-controls="chat-sidebar"
              onClick={() => {
                setLeftOpen(!leftOpen);
                setRightOpen(false);
              }}
            >
              <MessageSquare size={19} />
            </Button>
            <span className="desktop-crumb">
              {t.crumb} <ChevronRight size={14} />
            </span>
            <strong>
              {view === "dashboard"
                ? t.sourcesTitle
                : view === "upload"
                  ? t.uploadTitle
                  : t.analysisTitle}
            </strong>
          </div>
          <nav className="workspace-nav" aria-label={t.nav}>
            <Button
              variant="ghost"
              size="plain"
              className={view === "analysis" ? "active" : ""}
              aria-current={view === "analysis" ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setView("analysis");
                setTab("analysis");
              }}
            >
              <Sparkles size={15} />
              <span>{t.chat}</span>
            </Button>
            <Button
              variant="ghost"
              size="plain"
              className={view === "dashboard" ? "active" : ""}
              aria-current={view === "dashboard" ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setView("dashboard");
                setError("");
              }}
            >
              <FolderOpen size={15} />
              <span>{t.sources}</span>
            </Button>
            <Button
              variant="ghost"
              size="plain"
              className={view === "upload" ? "active" : ""}
              aria-current={view === "upload" ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setView("upload");
                setError("");
              }}
            >
              <Upload size={15} />
              <span>{t.upload}</span>
            </Button>
          </nav>
          <Button
            variant="ghost"
            size="plain"
            className="schema-toggle secondary"
            aria-label={t.openSchemas}
            aria-expanded={rightOpen}
            aria-controls="schema-sidebar"
            onClick={() => {
              setRightOpen(!rightOpen);
              setLeftOpen(false);
            }}
          >
            <Database size={16} />
            <span>{t.schemas}</span>
          </Button>
        </header>
        <div
          className={`page-content ${view === "analysis" ? "analysis-content" : ""}`}
        >
          {loadingData ? (
            <div className="workspace-loading" role="status">
              <RefreshCw size={24} className="spin" />
              <h2>{t.preparing}</h2>
              <p>{t.loading}</p>
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
            <section className={cube ? "analysis-panel" : "analysis-empty"}>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">{t.eyebrow}</span>
                  <h1>{t.heading}</h1>
                  <p className="muted">
                    {activeSource
                      ? t.exploring(activeSource.schema_name)
                      : t.connectPrompt}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="plain"
                  className="secondary"
                  disabled={busy}
                  onClick={discover}
                >
                  <RefreshCw size={15} className={busy ? "spin" : ""} />
                  {t.discoverCubes}
                </Button>
              </div>
              {!cube ? (
                <section className="empty-card">
                  <Database size={38} />
                  <h2>{selectedSource ? t.noTables : t.startWithData}</h2>
                  <p>{selectedSource ? t.noTablesText : t.startWithDataText}</p>
                  <Button
                    variant="ghost"
                    size="plain"
                    className="primary"
                    onClick={() =>
                      selectedSource ? void discover() : setView("upload")
                    }
                    disabled={busy}
                  >
                    {selectedSource ? t.discoverTables : t.uploadData}{" "}
                    <ArrowUp size={16} />
                  </Button>
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
                          ? t.kindCube(cube.definition.kind)
                          : t.sourceCube}
                      </span>
                    </div>
                    <div className="cube-stats">
                      <div>
                        <span>{t.dimensions}</span>
                        <strong>{cube.definition.dimensions.length}</strong>
                      </div>
                      <div>
                        <span>{t.candidateMeasures}</span>
                        <strong>{cube.definition.measures.length}</strong>
                      </div>
                      <div>
                        <span>{t.estimatedRows}</span>
                        <strong>
                          ~{cube.definition.estimated_rows.toLocaleString(intl)}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="tabs">
                    <Button
                      variant="ghost"
                      size="plain"
                      className={tab === "analysis" ? "active" : ""}
                      onClick={() => setTab("analysis")}
                    >
                      <Sparkles size={16} />
                      {t.analysisTab}
                    </Button>
                    <Button
                      variant="ghost"
                      size="plain"
                      className={tab === "schema" ? "active" : ""}
                      onClick={() => setTab("schema")}
                    >
                      <Table2 size={16} />
                      {t.schemaTab}
                    </Button>
                    <Button
                      variant="ghost"
                      size="plain"
                      className="new-analysis"
                      disabled={busy}
                      onClick={() => choose(selected)}
                    >
                      <Plus size={15} />
                      {t.newAnalysis}
                    </Button>
                  </div>
                  {error && tab === "schema" && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  {tab === "schema" ? (
                    <section className="schema-card">
                      <div className="profile-heading">
                        <h3>{t.businessModel}</h3>
                        <Button
                          variant="ghost"
                          size="plain"
                          className="secondary"
                          disabled={busy}
                          onClick={profile}
                        >
                          {t.profile}
                        </Button>
                      </div>
                      <p>{cube.definition.description}</p>
                      <p className="muted">{cube.definition.grain}</p>
                      {!!cube.definition.joins?.length && (
                        <div className="source-relationships">
                          <h3>{t.relatedDimensions}</h3>
                          <p className="muted">{t.relatedText}</p>
                          {cube.definition.joins.map((join) => (
                            <p className="relationship" key={join.path}>
                              <strong>{join.path}</strong> → {join.schema}.
                              {join.table} · {t.manyToOne}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>{t.field}</th>
                              <th>{t.pgType}</th>
                              <th>{t.role}</th>
                              <th>{t.nullable}</th>
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
                                    (f.key ? t.identifier : t.dimension)}
                                </td>
                                <td>{f.nullable ? t.yes : t.no}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <h3>{t.candidateMeasures}</h3>
                      <div className="chips">
                        {cube.definition.measures.map((m, i) => (
                          <span className="tag" key={i} title={m.description}>
                            {m.label || `${m.aggregation}(${m.field || "*"})`}
                          </span>
                        ))}
                      </div>
                      {!!importedTable?.foreign_keys.length && (
                        <div className="source-relationships">
                          <h3>{t.importedRelationships}</h3>
                          <p className="muted">{t.importedText}</p>
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
                          <h3>{t.exploreModel}</h3>
                          {cube.definition.suggested_questions.map(
                            (suggestion) => (
                              <Button
                                variant="ghost"
                                size="plain"
                                className="secondary"
                                key={suggestion}
                                disabled={busy}
                                onClick={() => {
                                  setQuestion(suggestion);
                                  setTab("analysis");
                                }}
                              >
                                {suggestion}
                              </Button>
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
                    <div className="chat-body">
                      <ChatThread
                        key={session || selected}
                        messages={messages}
                        pendingQuestion={pendingQuestion}
                        steps={agentSteps}
                        busy={busy && !!pendingQuestion}
                      >
                        <div className="conversation-empty">
                          <span className="sparkle">
                            <Sparkles size={26} />
                          </span>
                          <h2>{t.emptyTitle}</h2>
                          <p>
                            {t.emptyExplore}{" "}
                            <strong>{cube.definition.name}</strong>{" "}
                            {t.emptyWith}
                            <br />
                            {t.emptyEvidence}
                          </p>
                          <div className="suggestions">
                            <Button
                              variant="ghost"
                              size="plain"
                              disabled={busy}
                              onClick={() => setQuestion(t.writeAnalysisPrompt)}
                            >
                              <Sparkles size={17} />
                              <span>
                                {t.writeAnalysis}
                                <small>{t.writeAnalysisHint}</small>
                              </span>
                              <ChevronRight size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="plain"
                              disabled={busy}
                              onClick={countRows}
                            >
                              <Table2 size={17} />
                              <span>
                                {t.countRows}
                                <small>{t.countRowsHint}</small>
                              </span>
                              <ChevronRight size={16} />
                            </Button>
                            {suggestedDimension && (
                              <Button
                                variant="ghost"
                                size="plain"
                                disabled={busy}
                                onClick={() =>
                                  setQuestion(t.countBy(suggestedDimension))
                                }
                              >
                                <Layers3 size={17} />
                                <span>
                                  {t.compare}
                                  <small>{suggestedDimension}</small>
                                </span>
                                <ChevronRight size={16} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </ChatThread>
                      <div className="composer-wrap">
                        {error && (
                          <p className="error" role="alert">
                            {error}
                          </p>
                        )}
                        <form onSubmit={ask}>
                          <InputGroup className="composer">
                            <label className="sr-only" htmlFor="question">
                              {t.askLabel}
                            </label>
                            <InputGroupTextarea
                              id="question"
                              value={question}
                              onChange={(e) => setQuestion(e.target.value)}
                              disabled={busy}
                              maxLength={2000}
                              placeholder={t.askPlaceholder(
                                cube.definition.name,
                              )}
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
                            <InputGroupAddon
                              align="block-end"
                              className="composer-footer"
                            >
                              <span>
                                <Box size={13} />
                                {cube.definition.name}
                              </span>
                              <InputGroupButton
                                variant="default"
                                size="icon-sm"
                                className="send-button"
                                type="submit"
                                disabled={busy || !question.trim()}
                                aria-label={t.send}
                              >
                                <ArrowUp size={18} />
                              </InputGroupButton>
                            </InputGroupAddon>
                          </InputGroup>
                        </form>
                        <p className="composer-note">{t.composerNote}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
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
