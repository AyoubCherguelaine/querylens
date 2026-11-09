"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Database,
  Table2,
  Coins,
  Cpu,
  ArrowRight,
  Upload,
  Layers3,
  MessageSquare,
  Sliders,
  BarChart3,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle2,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";
import type { Cube, Session, Source, SourceOverview, UserInfo } from "@/lib/api";
import { getModelCreditCost } from "@/lib/api";
import { useT } from "@/lib/i18n/client";

export function formatModelName(modelId?: string): string {
  if (!modelId) return "GPT-4o Mini";
  const id = modelId.toLowerCase().trim();
  if (id.includes("gpt-oss-120b")) return "Bedrock GPT-OSS 120B";
  if (id.includes("gpt-4o-mini")) return "GPT-4o Mini";
  if (id.includes("gpt-4o")) return "GPT-4o";
  if (id.includes("gpt-4.1-mini")) return "GPT-4.1 Mini";
  if (id.includes("gpt-4.1")) return "GPT-4.1";
  if (id.includes("claude-3-5-sonnet") || id.includes("claude-3.5-sonnet")) return "Claude 3.5 Sonnet";
  if (id.includes("claude-3-haiku")) return "Claude 3 Haiku";
  if (id.includes("gemini-1.5-pro")) return "Gemini 1.5 Pro";
  if (id.includes("gemini-1.5-flash")) return "Gemini 1.5 Flash";

  const clean = modelId.replace(/^[^./\\]+[./\\]/, "");
  return clean.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSourceName(source: Source): string {
  const name = source.name || source.schema_name || "Dataset";
  const match = name.match(/dataset_?(\d{4})(\d{2})(\d{2})/i);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) {
      const monthStr = date.toLocaleDateString("en", { month: "short" });
      return `Dataset (${monthStr} ${d}, ${y})`;
    }
  }
  return name;
}

export function OverviewDashboard({
  user,
  overview,
  cubes,
  sessions,
  onOpenSource,
  onOpenSources,
  onOpenSession,
  onStartAnalysis,
  onOpenSchemas,
  onOpenUpload,
  onOpenBoard,
  onOpenSettings,
  onAskPrompt,
}: {
  user?: UserInfo;
  overview: SourceOverview;
  cubes: Cube[];
  sessions: Session[];
  onOpenSource: (id: string) => void;
  onOpenSources?: () => void;
  onOpenSession: (session: Session) => void;
  onStartAnalysis: () => void;
  onOpenSchemas: () => void;
  onOpenUpload: () => void;
  onOpenBoard?: () => void;
  onOpenSettings: (tab?: "model" | "credits") => void;
  onAskPrompt: (prompt: string) => void;
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.overview;
  const tChats = dictionary.chats;
  const sources = overview.sources;
  const totalTables = cubes.length;
  const importedRows = sources
    .flatMap((s) => s.manifest.tables || [])
    .reduce((total, t) => total + t.row_count, 0);

  const modelName = user?.model_settings?.model || "gpt-4o-mini";
  const processMode = user?.model_settings?.process_mode || "standard";
  const modelCost = getModelCreditCost(modelName);
  const credits = user?.credits ?? 100;

  function sessionName(item: Session) {
    const ids = item.cube_ids?.length ? item.cube_ids : [item.cube_id];
    const names = ids
      .map((id) => cubes.find((c) => c.id === id)?.definition.name)
      .filter(Boolean) as string[];

    if (!names.length) return tChats.fallbackName;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names[0]} (+${names.length - 1} tables)`;
  }

  return (
    <div className="overview-container">
      {/* Hero Welcome Banner */}
      <section className="overview-hero">
        <div className="hero-content">
          <span className="hero-eyebrow">
            <Sparkles size={14} /> QUERYLENS ANALYTICS
          </span>
          <h1>{t.welcome(user?.full_name || "Analyst")}</h1>
          <p className="hero-subtitle">{t.subtitle}</p>
        </div>

        <div className="hero-credit-badge">
          <div className="credit-pill-main">
            <Coins size={22} className="coins-icon" />
            <div>
              <span className="credits-amount">{credits.toLocaleString(intl)}</span>
              <small className="credits-tag">{t.creditsBadge}</small>
            </div>
          </div>
          <Button
            variant="ghost"
            size="plain"
            className="secondary topup-pill-btn"
            onClick={() => onOpenSettings("credits")}
          >
            {t.manageCredits} <ArrowRight size={14} />
          </Button>
        </div>
      </section>

      {/* 4 Metric Stats Grid */}
      <section className="overview-stats-grid" aria-label="Analytical metrics">
        {/* Credits Card */}
        <div
          className="stat-card clickable"
          onClick={() => onOpenSettings("credits")}
          role="button"
          tabIndex={0}
        >
          <div className="stat-icon-wrap credits">
            <Coins size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{t.creditsTitle}</span>
            <strong className="stat-value">{credits.toLocaleString(intl)}</strong>
            <span className="stat-sub">{t.creditRates}</span>
          </div>
          <ChevronRight size={18} className="stat-arrow" />
        </div>

        {/* Data Sources Card */}
        <div
          className="stat-card clickable"
          onClick={() => (onOpenSources ? onOpenSources() : onOpenUpload())}
          role="button"
          tabIndex={0}
        >
          <div className="stat-icon-wrap sources">
            <Database size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{t.dataSourcesStat}</span>
            <strong className="stat-value">{sources.length}</strong>
            <span className="stat-sub">
              {importedRows > 0
                ? `${importedRows.toLocaleString(intl)} rows`
                : t.dataSourcesSub}
            </span>
          </div>
          <ChevronRight size={18} className="stat-arrow" />
        </div>

        {/* Tables Card */}
        <div
          className="stat-card clickable"
          onClick={onOpenSchemas}
          role="button"
          tabIndex={0}
        >
          <div className="stat-icon-wrap tables">
            <Table2 size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{t.tablesStat}</span>
            <strong className="stat-value">{totalTables}</strong>
            <span className="stat-sub">{t.tablesSub}</span>
          </div>
          <ChevronRight size={18} className="stat-arrow" />
        </div>

        {/* AI Model Card */}
        <div
          className="stat-card clickable"
          onClick={() => onOpenSettings("model")}
          role="button"
          tabIndex={0}
        >
          <div className="stat-icon-wrap model">
            <Cpu size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{t.modelStat}</span>
            <strong className="stat-value model-name" title={modelName}>
              {formatModelName(modelName)}
            </strong>
            <span className="stat-sub mode-tag">{t.modelCostBadge(modelCost)}</span>
          </div>
          <ChevronRight size={18} className="stat-arrow" />
        </div>
      </section>

      {/* Quick Actions Bar */}
      <section className="overview-section">
        <h2 className="section-title">{t.quickActionsTitle}</h2>
        <div className="actions-grid">
          <Button
            variant="ghost"
            size="plain"
            className="action-tile primary-tile"
            onClick={onStartAnalysis}
          >
            <div className="tile-icon">
              <Sparkles size={20} />
            </div>
            <div className="tile-text">
              <strong>{t.startChatAction}</strong>
              <small>{t.startChatDesc}</small>
            </div>
            <ArrowRight size={16} className="tile-arrow" />
          </Button>

          <Button
            variant="ghost"
            size="plain"
            className="action-tile"
            onClick={onOpenUpload}
          >
            <div className="tile-icon upload-icon">
              <Upload size={20} />
            </div>
            <div className="tile-text">
              <strong>{t.importDataAction}</strong>
              <small>{t.importDataDesc}</small>
            </div>
            <ArrowRight size={16} className="tile-arrow" />
          </Button>

          <Button
            variant="ghost"
            size="plain"
            className="action-tile"
            onClick={onOpenSchemas}
          >
            <div className="tile-icon schemas-icon">
              <Layers3 size={20} />
            </div>
            <div className="tile-text">
              <strong>{t.exploreSchemasAction}</strong>
              <small>{t.exploreSchemasDesc}</small>
            </div>
            <ArrowRight size={16} className="tile-arrow" />
          </Button>

          {onOpenBoard && (
            <Button
              variant="ghost"
              size="plain"
              className="action-tile board-tile"
              onClick={onOpenBoard}
            >
              <div className="tile-icon board-icon">
                <LayoutGrid size={20} />
              </div>
              <div className="tile-text">
                <strong>{dictionary.board.title}</strong>
                <small>{dictionary.board.subtitle}</small>
              </div>
              <ArrowRight size={16} className="tile-arrow" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="plain"
            className="action-tile"
            onClick={() => onOpenSettings("model")}
          >
            <div className="tile-icon settings-icon">
              <Sliders size={20} />
            </div>
            <div className="tile-text">
              <strong>{t.modelSettingsAction}</strong>
              <small>{t.modelSettingsDesc}</small>
            </div>
            <ArrowRight size={16} className="tile-arrow" />
          </Button>
        </div>
      </section>

      {/* Dual Column: Recent Conversations & Connected Data Sources */}
      <div className="overview-dual-grid">
        {/* Recent Conversations */}
        <section className="overview-card recent-sessions-card">
          <div className="card-header-row">
            <h3>
              <MessageSquare size={17} /> {t.recentConversationsTitle}
            </h3>
            <span className="count-pill">{sessions.length}</span>
          </div>

          <div className="sessions-list">
            {!sessions.length ? (
              <div className="empty-substate">
                <MessageSquare size={28} className="muted-icon" />
                <p>{t.noRecentConversations}</p>
                <Button
                  variant="ghost"
                  size="plain"
                  className="secondary small-action"
                  onClick={onStartAnalysis}
                >
                  <Sparkles size={14} /> {t.startChatAction}
                </Button>
              </div>
            ) : (
              sessions.slice(0, 5).map((session) => (
                <div key={session.id} className="session-item">
                  <div className="session-main">
                    <strong>{sessionName(session)}</strong>
                    <time dateTime={session.created_at}>
                      {new Date(session.created_at).toLocaleDateString(intl, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <Button
                    variant="ghost"
                    size="plain"
                    className="secondary resume-btn"
                    onClick={() => onOpenSession(session)}
                  >
                    {t.resumeSession} <ArrowRight size={13} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Connected Data Sources */}
        <section className="overview-card data-sources-card">
          <div className="card-header-row">
            <h3>
              <Database size={17} /> {t.dataSourcesTitle}
            </h3>
            <span className="count-pill">{sources.length}</span>
          </div>

          <div className="sources-list">
            {!sources.length ? (
              <div className="empty-substate">
                <Database size={28} className="muted-icon" />
                <p>{t.noSourcesConnected}</p>
                <Button
                  variant="ghost"
                  size="plain"
                  className="primary small-action"
                  onClick={onOpenUpload}
                >
                  <Upload size={14} /> {t.importDataAction}
                </Button>
              </div>
            ) : (
              sources.map((source) => (
                <div key={source.id} className="source-item">
                  <div className="source-main">
                    <div className="source-title-wrap">
                      <span className="source-kind-badge">{source.kind.toUpperCase()}</span>
                      <strong title={source.name}>{formatSourceName(source)}</strong>
                    </div>
                    <small className="source-meta">
                      {source.schema_name} · {source.table_count ?? source.manifest?.tables?.length ?? 1} tables
                    </small>
                  </div>
                  <Button
                    variant="ghost"
                    size="plain"
                    className="secondary explore-source-btn"
                    onClick={() => onOpenSource(source.id)}
                  >
                    {t.exploreSource} <ArrowRight size={13} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Suggested Starters */}
      <section className="overview-section starters-section">
        <h2 className="section-title">
          <TrendingUp size={16} /> {t.suggestedStartersTitle}
        </h2>
        <div className="starters-grid">
          <Button
            variant="ghost"
            size="plain"
            className="starter-card"
            onClick={() => onAskPrompt(t.starter1)}
          >
            <div className="starter-header">
              <Sparkles size={16} />
              <span>Summary Analysis</span>
            </div>
            <p>{t.starter1}</p>
          </Button>

          <Button
            variant="ghost"
            size="plain"
            className="starter-card"
            onClick={() => onAskPrompt(t.starter2)}
          >
            <div className="starter-header">
              <BarChart3 size={16} />
              <span>Dimension Breakdown</span>
            </div>
            <p>{t.starter2}</p>
          </Button>

          <Button
            variant="ghost"
            size="plain"
            className="starter-card"
            onClick={() => onAskPrompt(t.starter3)}
          >
            <div className="starter-header">
              <TrendingUp size={16} />
              <span>Visual Chart</span>
            </div>
            <p>{t.starter3}</p>
          </Button>
        </div>
      </section>
    </div>
  );
}

