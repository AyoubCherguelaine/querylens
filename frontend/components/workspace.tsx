"use client";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BarChart3,
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
  LayoutDashboard,
  LayoutGrid,
  Coins,
  Cpu,
  Settings as SettingsIcon,
  AlertCircle,
  X,
  Sliders,
} from "lucide-react";
import {
  api,
  askAgent,
  deleteDashboardCard,
  fetchDashboardCards,
  pinDashboardCard,
  suggestTables,
  type AgentStep,
  type Cube,
  type DashboardCard,
  type DashboardCardCreatePayload,
  type Message,
  type Result,
  type Session,
  type Source,
  type SourceOverview,
  type UserInfo,
  getModelCreditCost,
} from "@/lib/api";
import { ChatTables } from "./chat-tables";
import { ChatSidebar } from "./chat-sidebar";
import { ImportData } from "./import-data";
import { SourceDashboard } from "./source-dashboard";
import { OverviewDashboard } from "./overview-dashboard";
import { DashboardBoard } from "./dashboard-board";
import { ProfileMainPage } from "./profile-main-page";
import { SettingsView } from "./settings-view";
import { SettingsDialog } from "./settings-dialog";
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
  const { t: dictionary, intl, locale } = useT();
  const t = dictionary.workspace;
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [user, setUser] = useState<UserInfo | undefined>(),
    [cubes, setCubes] = useState<Cube[]>([]),
    [selected, setSelected] = useState(""),
    [session, setSession] = useState(""),
    [sessions, setSessions] = useState<Session[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"analysis" | "schema">("analysis");
  const [view, setView] = useState<
    "overview" | "dashboard" | "sources" | "upload" | "settings" | "profile-main" | "profile-chat"
  >("overview");
  const [dashboardCards, setDashboardCards] = useState<DashboardCard[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"model" | "credits">("model");
  const [insufficientCredits, setInsufficientCredits] = useState<{
    open: boolean;
    needed: number;
    balance: number;
    model?: string;
  } | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [leftOpen, setLeftOpen] = useState(false);
  const messageSequence = useRef(0);
  const [selectedSource, setSelectedSource] = useState("");
  const [extraCubeIds, setExtraCubeIds] = useState<string[]>([]);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [autoSelectingTables, setAutoSelectingTables] = useState(false);
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
  const cube = cubes.find((c) => c.id === selected) || sourceCubes[0];
  const candidateCubes = sourceCubes;
  const validSourceCubeIds = useMemo(
    () => new Set(sourceCubes.map((c) => c.id)),
    [sourceCubes],
  );
  const chatCubeIds = [selected || cube?.id || "", ...extraCubeIds].filter(
    (id) => Boolean(id) && validSourceCubeIds.has(id),
  );
  const importedTable = activeSource?.manifest.tables?.find(
    (table) => table.name === cube?.definition.table,
  );
  const sourceSessions = sessions.filter((item) => {
    if (!selectedSource) return false;
    const ids = item.cube_ids?.length ? item.cube_ids : [item.cube_id];
    return ids.some(
      (id) => cubes.find((c) => c.id === id)?.source_id === selectedSource,
    );
  });
  const suggestedDimension =
    cube?.definition.dimensions?.find(
      (name) =>
        !cube.definition.fields.find((field) => field.name === name)?.key &&
        name !== "id",
    ) || cube?.definition.dimensions?.[0];

  const isProfileMode =
    Boolean(activeSource) &&
    (view === "profile-main" || view === "profile-chat");

  const showSidebar = isProfileMode;

  async function load() {
    setLoadingData(true);
    try {
      const [list, history, sourceData] = await Promise.all([
        api<Cube[]>("cubes"),
        api<Session[]>("chat/sessions"),
        api<SourceOverview>("sources"),
      ]);
      setCubes(list);
      setSessions(history);
      setOverview(sourceData);

      if (selectedSource) {
        const matching = list.filter((c) => c.source_id === selectedSource);
        if (matching.length && !matching.some((c) => c.id === selected)) {
          setSelected(matching[0].id);
        }
      }
      void loadDashboardCards();
      return { cubes: list, sessions: history, overview: sourceData };
    } catch (e) {
      setError((e as Error).message);
      return { cubes: [], sessions: [], overview };
    } finally {
      setLoadingData(false);
    }
  }

  async function loadDashboardCards() {
    try {
      const cards = await fetchDashboardCards();
      setDashboardCards(cards);
    } catch (err) {
      console.error("Failed to load dashboard cards", err);
    }
  }

  async function handlePinCard(payload: DashboardCardCreatePayload) {
    const existing = dashboardCards.find(
      (c) =>
        c.card_type === payload.card_type &&
        (c.title === payload.title || (c.query_text && payload.query_text && c.query_text === payload.query_text)),
    );

    if (existing) {
      try {
        await deleteDashboardCard(existing.id);
        setDashboardCards((prev) => prev.filter((c) => c.id !== existing.id));
      } catch (e) {
        console.error("Failed to unpin card", e);
      }
    } else {
      try {
        const pinned = await pinDashboardCard({
          ...payload,
          source_id: selectedSource || undefined,
          cube_id: selected || undefined,
          session_id: session || undefined,
        });
        setDashboardCards((prev) => [pinned, ...prev.filter((c) => c.id !== pinned.id)]);
      } catch (e) {
        console.error("Failed to pin card", e);
      }
    }
  }

  function openSource(id: string, availableCubes = cubes) {
    setSelectedSource(id);
    const sourceCubesList = availableCubes.filter((c) => c.source_id === id);
    setSelected(sourceCubesList[0]?.id || "");
    setSession("");
    setExtraCubeIds([]);
    setMessages([]);
    setQuestion("");
    setError("");
    setTab("analysis");
    setView("profile-main");
  }

  function startChatFromProfile(prompt?: string, cubeIds?: string[]) {
    if (prompt) {
      setQuestion(prompt);
    }
    if (cubeIds && cubeIds.length) {
      setSelected(cubeIds[0]);
      setExtraCubeIds(cubeIds.slice(1));
    }
    setView("profile-chat");
  }

  function closeSource() {
    setSelectedSource("");
    setSelected("");
    setSession("");
    setExtraCubeIds([]);
    setMessages([]);
    setQuestion("");
    setError("");
    setView("overview");
  }

  async function sourceComplete(source: Source) {
    const latest = await load();
    setUser((prev) =>
      prev ? { ...prev, credits: Math.max(0, prev.credits - 10) } : prev,
    );
    openSource(source.id, latest.cubes);
  }

  useEffect(() => {
    api<UserInfo>("users/me")
      .then((userData) => {
        setUser(userData);
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
    };
    window.addEventListener("resize", resetDrawers);
    return () => window.removeEventListener("resize", resetDrawers);
  }, []);

  useEffect(() => {
    if (!leftOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.getElementById("chat-sidebar");
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
  }, [leftOpen]);

  function choose(id: string) {
    setLeftOpen(false);
    setSelected(id);
    const c = cubes.find((item) => item.id === id);
    if (c?.source_id && c.source_id !== selectedSource) {
      setSelectedSource(c.source_id);
    }
    setQuestion("");
    setSession("");
    setExtraCubeIds([]);
    setMessages([]);
    setError("");
    setTab("analysis");
  }

  function newChat() {
    setLeftOpen(false);
    setSession("");
    setMessages([]);
    setQuestion("");
    setAgentSteps([]);
    setExtraCubeIds([]);
    setError("");
    setView("profile-chat");
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
      const history = await api<{ messages: Message[]; cube_ids: string[] }>(
        `chat/session/${item.id}`,
      );
      setLeftOpen(false);
      setQuestion("");
      setSelected(item.cube_id);
      setSelectedSource(
        cubes.find((c) => c.id === item.cube_id)?.source_id || "",
      );
      setView("profile-chat");
      setSession(item.id);
      setExtraCubeIds(
        (history.cube_ids || [item.cube_id]).filter(
          (id) => id !== item.cube_id,
        ),
      );
      setMessages(history.messages);
      setTab("analysis");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeChatTables(ids: string[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const selectedIds = session
        ? (
            await api<{ cube_ids: string[] }>(
              `chat/session/${session}/tables`,
              { cube_ids: ids },
            )
          ).cube_ids
        : ids;
      setExtraCubeIds(selectedIds.filter((id) => id !== selected));
      setSessions((previous) =>
        previous.map((item) =>
          item.id === session ? { ...item, cube_ids: selectedIds } : item,
        ),
      );
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

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !question.trim() || !cube) return;
    const currentModel = user?.model_settings?.model || "gpt-4o-mini";
    const neededCredits = getModelCreditCost(currentModel);
    const userCredits = user?.credits ?? 100;
    if (userCredits < neededCredits) {
      setInsufficientCredits({
        open: true,
        needed: neededCredits,
        balance: userCredits,
        model: currentModel,
      });
      return;
    }
    setBusy(true);
    setAgentSteps([]);
    setError("");
    const text = question.trim();
    setPendingQuestion(text);
    setQuestion("");

    let effectiveCubeIds = chatCubeIds;
    if (activeSource) {
      setAutoSelectingTables(true);
      try {
        const suggestion = await suggestTables(text, activeSource.id);
        if (suggestion.cube_ids && suggestion.cube_ids.length > 0) {
          effectiveCubeIds = Array.from(
            new Set([...chatCubeIds, ...suggestion.cube_ids]),
          );
          setExtraCubeIds(effectiveCubeIds.filter((id) => id !== selected));
        }
      } catch {
        // Fallback to currently selected tables
      } finally {
        setAutoSelectingTables(false);
      }
    }

    try {
      let id = session;
      if (!id) {
        const created = await api<{ id: string }>("chat/session", {
          cube_id: selected,
          cube_ids: effectiveCubeIds,
        });
        id = created.id;
        setSession(id);
      }
      const result = await askAgent(id, text, (step: AgentStep) => {
        setAgentSteps((previous) => {
          const found = previous.some((item) => item.id === step.id);
          return found
            ? previous.map((item) => (item.id === step.id ? step : item))
            : [...previous, step];
        });
      });
      appendMessage(text, result);
      if (result.credits_remaining !== undefined) {
        setUser((prev) =>
          prev ? { ...prev, credits: result.credits_remaining! } : prev,
        );
      } else {
        const spent = result.credits_spent ?? neededCredits;
        setUser((prev) =>
          prev ? { ...prev, credits: Math.max(0, prev.credits - spent) } : prev,
        );
      }
      setAgentSteps([]);
      void api<Session[]>("chat/sessions")
        .then(setSessions)
        .catch(() => {});
    } catch (e: any) {
      setQuestion((draft) => draft || text);
      if (
        e?.status === 402 ||
        e?.detail?.needed_credits ||
        e?.message?.includes("credits")
      ) {
        const detail = e.detail || {};
        const needed =
          detail.needed_credits ||
          getModelCreditCost(user?.model_settings?.model || "gpt-4o-mini");
        const balance = detail.current_balance ?? user?.credits ?? 0;
        setInsufficientCredits({
          open: true,
          needed,
          balance,
          model: detail.model || user?.model_settings?.model || "gpt-4o-mini",
        });
      }
      setError(e.message || "Failed to process analytical query.");
    } finally {
      setPendingQuestion("");
      setBusy(false);
    }
  }

  async function deleteSession(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`chat/session/${id}`, {}, "DELETE");
      setSessions((previous) => previous.filter((item) => item.id !== id));
      if (session === id) {
        setSession("");
        setMessages([]);
        setQuestion("");
        setAgentSteps([]);
        setExtraCubeIds([]);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetWorkspace() {
    if (busy) return;
    try {
      await api("cubes/reset", {}, "POST");
      setSession("");
      setExtraCubeIds([]);
      setCubes([]);
      setSelected("");
      setQuestion("");
      setOverview((previous) => ({
        ...previous,
        sources: [],
        available_schemas: [],
      }));
      setSelectedSource("");
      setView("overview");
      setLeftOpen(false);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }

  async function signOut() {
    try {
      await api("auth/logout", {}, "POST");
    } finally {
      router.push("/login");
    }
  }

  if (authenticated === null)
    return (
      <main className="loading-screen" role="status">
        <RefreshCw size={24} className="spin" />
        <p>{t.connecting}</p>
      </main>
    );
  if (!authenticated)
    return (
      <main className="loading-screen" role="status">
        <RefreshCw size={24} className="spin" />
        <p>{t.openingSignIn}</p>
      </main>
    );

  return (
    <div className={`workspace ${!showSidebar ? "no-sidebar" : ""}`}>
      {showSidebar && leftOpen && (
        <Button
          variant="ghost"
          size="plain"
          className="panel-backdrop"
          tabIndex={-1}
          aria-label={t.closeSidebar}
          onClick={() => setLeftOpen(false)}
        />
      )}
      {showSidebar && (
        <ChatSidebar
          leftOpen={leftOpen}
          busy={busy}
          cubes={cubes}
          sessions={sourceSessions}
          session={session}
          activeSource={activeSource}
          onClose={() => setLeftOpen(false)}
          onNewChat={newChat}
          onOpenSession={openSession}
          onSignOut={signOut}
          onOpenSettings={() => {
            setSettingsTab("model");
            setSettingsOpen(true);
          }}
          onCloseSource={closeSource}
          onSwitchSource={() => setView("sources")}
        />
      )}
      <main className="main-panel" inert={showSidebar && leftOpen ? true : undefined}>
        <header className="topbar">
          <div className="workspace-crumb">
            {showSidebar && (
              <Button
                variant="ghost"
                size="plain"
                className="icon-button mobile-toggle"
                aria-label={t.openChats}
                aria-expanded={leftOpen}
                aria-controls="chat-sidebar"
                onClick={() => setLeftOpen(!leftOpen)}
              >
                <MessageSquare size={19} />
              </Button>
            )}

            {isProfileMode && activeSource ? (
              <div className="topbar-breadcrumbs">
                <Button
                  variant="ghost"
                  size="plain"
                  className="breadcrumb-root-btn"
                  onClick={closeSource}
                >
                  <LayoutDashboard size={14} />
                  <span>{t.overviewNav}</span>
                </Button>
                <ChevronRight size={14} className="breadcrumb-chevron" />
                <strong className="profile-active-title" title={activeSource.schema_name}>
                  <bdi>{activeSource.name || activeSource.schema_name}</bdi>
                </strong>
              </div>
            ) : (
              <div className="topbar-breadcrumbs">
                <span className="desktop-crumb">
                  {t.crumb} <ChevronRight size={14} />
                </span>
                <strong>
                  {view === "overview"
                    ? t.overviewNav
                    : view === "dashboard"
                    ? dictionary.board.nav
                    : view === "sources"
                    ? t.dataSourcesNav
                    : view === "upload"
                    ? t.uploadNav
                    : t.settingsNav}
                </strong>
              </div>
            )}
          </div>

          {isProfileMode && activeSource ? (
            <nav className="topbar-profile-subnav" aria-label="Profile navigation">
              <Button
                variant="ghost"
                size="plain"
                className={`profile-subnav-btn ${view === "profile-main" ? "active" : ""}`}
                aria-current={view === "profile-main" ? "page" : undefined}
                disabled={busy}
                onClick={() => {
                  setView("profile-main");
                  setError("");
                }}
              >
                <Table2 size={15} />
                <span>{dictionary.workspace.dataStructureNav}</span>
              </Button>
              <Button
                variant="ghost"
                size="plain"
                className={`profile-subnav-btn ${view === "profile-chat" ? "active" : ""}`}
                aria-current={view === "profile-chat" ? "page" : undefined}
                disabled={busy}
                onClick={() => {
                  setView("profile-chat");
                  setError("");
                }}
              >
                <Sparkles size={15} />
                <span>{dictionary.workspace.chatNav}</span>
              </Button>
              <Button
                variant="ghost"
                size="plain"
                className="profile-subnav-btn"
                disabled={busy}
                onClick={() => {
                  setView("dashboard");
                  setError("");
                }}
              >
                <LayoutGrid size={15} />
                <span>{dictionary.board.nav}</span>
                {dashboardCards.length > 0 && (
                  <span className="nav-badge-count">{dashboardCards.length}</span>
                )}
              </Button>
            </nav>
          ) : (
            <nav className="workspace-nav" aria-label={t.nav}>
              <Button
                variant="ghost"
                size="plain"
                className={view === "overview" ? "active" : ""}
                aria-current={view === "overview" ? "page" : undefined}
                disabled={busy}
                onClick={() => {
                  setView("overview");
                  setError("");
                }}
              >
                <LayoutDashboard size={15} />
                <span>{t.overviewNav}</span>
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
                <LayoutGrid size={15} />
                <span>{dictionary.board.nav}</span>
                {dashboardCards.length > 0 && (
                  <span className="nav-badge-count">{dashboardCards.length}</span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="plain"
                className={view === "sources" ? "active" : ""}
                aria-current={view === "sources" ? "page" : undefined}
                disabled={busy}
                onClick={() => {
                  setView("sources");
                  setError("");
                }}
              >
                <FolderOpen size={15} />
                <span>{t.dataSourcesNav}</span>
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
                <span>{t.uploadNav}</span>
              </Button>
              <Button
                variant="ghost"
                size="plain"
                className={view === "settings" ? "active" : ""}
                aria-current={view === "settings" ? "page" : undefined}
                disabled={busy}
                onClick={() => {
                  setView("settings");
                  setError("");
                }}
              >
                <Sliders size={15} />
                <span>{t.settingsNav}</span>
              </Button>
            </nav>
          )}

          <div className="topbar-controls">
            {activeSource && (
              <Button
                variant="ghost"
                size="plain"
                className="close-profile-topbar-btn"
                onClick={closeSource}
                title={t.closeProfileHint}
                aria-label={t.closeProfileAria}
              >
                <X size={13} />
                <span>{locale === "ar" ? "إغلاق الملف" : "Close Profile"}</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="plain"
              className={`credits-pill-topbar ${
                (user?.credits ?? 100) < 15 ? "low-credits" : ""
              }`}
              onClick={() => {
                setSettingsTab("credits");
                setSettingsOpen(true);
              }}
              title={dictionary.overview.creditRates}
            >
              <Coins size={14} className="coins-icon" />
              <span>{t.creditsPill(user?.credits ?? 100)}</span>
            </Button>

            {(() => {
              const activeModel = user?.model_settings?.model || "gpt-4o-mini";
              const cost = getModelCreditCost(activeModel);
              return (
                <Button
                  variant="ghost"
                  size="plain"
                  className="model-pill-topbar"
                  onClick={() => {
                    setSettingsTab("model");
                    setSettingsOpen(true);
                  }}
                  title={`OpenAI ${activeModel} (${cost} credits / question)`}
                >
                  <Cpu size={14} />
                  <span>{activeModel}</span>
                  <span className="model-pill-cost">{cost}c</span>
                </Button>
              );
            })()}

            <Button
              variant="ghost"
              size="plain"
              className="icon-button settings-toggle"
              aria-label={t.settingsButton}
              onClick={() => {
                setSettingsTab("model");
                setSettingsOpen(true);
              }}
            >
              <SettingsIcon size={16} />
            </Button>
          </div>
        </header>

        <div
          className={`page-content ${view === "profile-chat" ? "analysis-content" : ""}`}
        >
          {loadingData ? (
            <div className="workspace-loading" role="status">
              <RefreshCw size={24} className="spin" />
              <h2>{t.preparing}</h2>
              <p>{t.loading}</p>
            </div>
          ) : view === "profile-main" && activeSource ? (
            <ProfileMainPage
              source={activeSource}
              cubes={sourceCubes}
              overview={overview}
              user={user}
              selectedCubeId={selected}
              onSelectTable={(id) => setSelected(id)}
              onStartChat={(prompt, cubeIds) => startChatFromProfile(prompt, cubeIds)}
              onDiscover={discover}
              onCloseProfile={closeSource}
              busy={busy}
            />
          ) : view === "profile-chat" && activeSource && cube ? (
            <section className="analysis-panel chat-mode">
              <div className="profile-chat-header-bar">
                <div className="chat-profile-info">
                  <span className={`source-icon-sm ${activeSource.kind}`}>
                    <Database size={16} />
                  </span>
                  <div>
                    <h3><bdi>{activeSource.name || activeSource.schema_name}</bdi></h3>
                    <small>
                      {sourceCubes.length} {locale === "ar" ? "جداول" : "tables"} · {activeSource.kind === "existing" ? "PostgreSQL" : activeSource.kind.toUpperCase()}
                    </small>
                  </div>
                </div>
                <div className="chat-header-actions">
                  <Button
                    variant="ghost"
                    size="plain"
                    className="secondary view-structure-btn"
                    onClick={() => setView("profile-main")}
                  >
                    <Table2 size={15} />
                    <span>{dictionary.workspace.dataStructureNav}</span>
                  </Button>
                </div>
              </div>

              <div className="chat-body">
                <ChatThread
                  key={session || selected}
                  messages={messages}
                  pendingQuestion={pendingQuestion}
                  steps={agentSteps}
                  busy={busy && !!pendingQuestion}
                  onPinCard={handlePinCard}
                  dashboardCards={dashboardCards}
                >
                  <div className="conversation-empty">
                    <span className="sparkle">
                      <Sparkles size={26} />
                    </span>
                    <h2>
                      <bdi>{t.profileTitle(activeSource.schema_name)}</bdi>
                    </h2>
                    <p>
                      <span>{t.profileDesc1(activeSource.schema_name, sourceCubes.length)}</span>
                      <br />
                      <span>{t.profileDesc2}</span>
                    </p>
                    <div className="suggestions">
                      <Button
                        variant="ghost"
                        size="plain"
                        disabled={busy}
                        onClick={() => setQuestion(t.plotGraphPrompt)}
                      >
                        <BarChart3 size={17} />
                        <span>
                          {t.plotGraph}
                          <small>{t.plotGraphHint}</small>
                        </span>
                        <ChevronRight size={16} />
                      </Button>
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
                      {sourceCubes.length > 1 && (
                        <Button
                          variant="ghost"
                          size="plain"
                          disabled={busy}
                          onClick={() => {
                            void changeChatTables(
                              sourceCubes.map((c) => c.id),
                            );
                          }}
                        >
                          <Layers3 size={17} />
                          <span>
                            {t.allTablesAction(sourceCubes.length)}
                            <small>{t.allTablesActionHint}</small>
                          </span>
                          <ChevronRight size={16} />
                        </Button>
                      )}
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
                  {autoSelectingTables && (
                    <p className="auto-select-hint" role="status">
                      <RefreshCw size={12} className="spin" />
                      {t.identifyingTables}
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
                        placeholder={t.askProfilePlaceholder(activeSource.schema_name)}
                        rows={1}
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
                        <div className="composer-tables-group">
                          <span className="auto-detect-badge" title={t.autoDetectHint}>
                            <Sparkles size={12} /> {t.autoDetectTables}
                          </span>
                          <ChatTables
                            primary={cube}
                            candidates={candidateCubes}
                            selectedIds={chatCubeIds}
                            busy={busy}
                            onChange={changeChatTables}
                          />
                        </div>
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
            </section>
          ) : view === "dashboard" ? (
            <DashboardBoard
              cards={dashboardCards}
              onRefresh={loadDashboardCards}
              onOpenSession={(sessId) => {
                const sess = sessions.find((s) => s.id === sessId);
                if (sess) openSession(sess);
              }}
              onStartChat={(prompt) => {
                if (activeSource) {
                  newChat();
                  if (prompt) setQuestion(prompt);
                } else if (overview.sources.length > 0) {
                  openSource(overview.sources[0].id);
                  startChatFromProfile(prompt);
                } else {
                  setView("upload");
                }
              }}
            />
          ) : view === "sources" ? (
            <SourceDashboard
              overview={overview}
              activeSourceId={selectedSource}
              onOpen={openSource}
              onCloseSource={closeSource}
              onComplete={sourceComplete}
              onRefresh={async () => {
                await load();
              }}
            />
          ) : view === "upload" ? (
            <ImportData
              limits={overview.limits}
              onCancel={() => setView("sources")}
              onComplete={sourceComplete}
            />
          ) : view === "settings" ? (
            <SettingsView
              user={user}
              onUserUpdate={(updated) =>
                setUser((prev) => (prev ? { ...prev, ...updated } : prev))
              }
              onSignOut={signOut}
            />
          ) : (
            <OverviewDashboard
              user={user}
              overview={overview}
              cubes={cubes}
              sessions={sessions}
              onOpenSource={openSource}
              onOpenSources={() => setView("sources")}
              onOpenSession={openSession}
              onStartAnalysis={() => {
                if (overview.sources.length > 0) {
                  openSource(overview.sources[0].id);
                } else {
                  setView("upload");
                }
              }}
              onOpenSchemas={() => {
                if (overview.sources.length > 0) {
                  openSource(overview.sources[0].id);
                } else {
                  setView("sources");
                }
              }}
              onOpenBoard={() => setView("dashboard")}
              onOpenUpload={() => setView("upload")}
              onOpenSettings={(targetTab) => {
                setView("settings");
              }}
              onAskPrompt={(prompt) => {
                if (overview.sources.length > 0) {
                  openSource(overview.sources[0].id);
                  startChatFromProfile(prompt);
                } else {
                  setView("upload");
                }
              }}
            />
          )}
        </div>
      </main>

      <SettingsDialog
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        onUserUpdate={(updated) => {
          setUser((prev) => (prev ? { ...prev, ...updated } : prev));
        }}
      />

      {insufficientCredits?.open && (
        <div
          className="insufficient-credits-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="insufficient-credits-title"
        >
          <div className="insufficient-credits-dialog">
            <div className="insufficient-header">
              <div className="alert-icon-box">
                <AlertCircle size={26} />
              </div>
              <div className="insufficient-text">
                <h3 id="insufficient-credits-title">
                  {t.insufficientCreditsTitle}
                </h3>
                <p>
                  {t.insufficientCreditsMsg(
                    insufficientCredits.needed,
                    insufficientCredits.balance,
                    insufficientCredits.model,
                  )}
                </p>
              </div>
            </div>
            <div className="insufficient-actions">
              <Button
                variant="ghost"
                size="plain"
                className="secondary"
                onClick={() => setInsufficientCredits(null)}
              >
                {dictionary.settings.close}
              </Button>
              <Button
                variant="ghost"
                size="plain"
                className="primary"
                onClick={() => {
                  setInsufficientCredits(null);
                  setSettingsTab("credits");
                  setSettingsOpen(true);
                }}
              >
                <Coins size={15} />
                {dictionary.overview.manageCredits}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
