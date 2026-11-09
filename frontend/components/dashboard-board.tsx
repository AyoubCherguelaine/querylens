"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pin,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Search,
  Download,
  BarChart3,
  FileText,
  Table2,
  TrendingUp,
  Sparkles,
  RefreshCw,
  LayoutGrid,
  Filter,
  Calendar,
  Layers,
  Edit2,
  CheckCheck,
} from "lucide-react";
import type { DashboardCard, DashboardCardType } from "@/lib/api";
import { deleteDashboardCard, updateDashboardCard } from "@/lib/api";
import { GraphView } from "./graph-view";
import { WrittenAnalysis } from "./written-analysis";
import { Markdown } from "./markdown";
import { useT } from "@/lib/i18n/client";

export function DashboardBoard({
  cards,
  onRefresh,
  onOpenSession,
  onStartChat,
}: {
  cards: DashboardCard[];
  onRefresh: () => Promise<void>;
  onOpenSession?: (sessionId: string) => void;
  onStartChat?: (initialPrompt?: string) => void;
}) {
  const { t: dictionary, intl, locale } = useT();
  const t = dictionary.board;
  const isAr = locale === "ar";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | DashboardCardType>("all");
  const [nlFilter, setNlFilter] = useState("");
  const [appliedNlFilter, setAppliedNlFilter] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Type counts
  const counts = useMemo(() => {
    return {
      all: cards.length,
      chart: cards.filter((c) => c.card_type === "chart").length,
      report: cards.filter((c) => c.card_type === "report").length,
      table: cards.filter((c) => c.card_type === "table" || c.card_type === "metric").length,
    };
  }, [cards]);

  // Filtered cards
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      // Type match
      if (typeFilter === "chart" && card.card_type !== "chart") return false;
      if (typeFilter === "report" && card.card_type !== "report") return false;
      if (typeFilter === "table" && card.card_type !== "table" && card.card_type !== "metric")
        return false;

      // Text search
      const q = search.trim().toLowerCase();
      if (q) {
        const titleMatch = card.title?.toLowerCase().includes(q);
        const queryMatch = card.query_text?.toLowerCase().includes(q);
        const contentStr = JSON.stringify(card.content || {}).toLowerCase();
        const contentMatch = contentStr.includes(q);
        if (!titleMatch && !queryMatch && !contentMatch) return false;
      }

      // Natural language board modifier
      const nl = appliedNlFilter.trim().toLowerCase();
      if (nl) {
        const titleMatch = card.title?.toLowerCase().includes(nl);
        const queryMatch = card.query_text?.toLowerCase().includes(nl);
        const contentStr = JSON.stringify(card.content || {}).toLowerCase();
        const contentMatch = contentStr.includes(nl);
        if (!titleMatch && !queryMatch && !contentMatch) return false;
      }

      return true;
    });
  }, [cards, typeFilter, search, appliedNlFilter]);

  async function handleRemove(cardId: string) {
    if (deletingId) return;
    setDeletingId(cardId);
    try {
      await deleteDashboardCard(cardId);
      await onRefresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRename(cardId: string) {
    if (!editTitleValue.trim()) {
      setEditingCardId(null);
      return;
    }
    await updateDashboardCard(cardId, { title: editTitleValue.trim() });
    setEditingCardId(null);
    await onRefresh();
  }

  function handleCopyQuery(card: DashboardCard) {
    const textToCopy = card.query_text || card.content?.sql || card.title;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(card.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleExportBoard() {
    const exportPayload = {
      exported_at: new Date().toISOString(),
      board_title: "QueryLens Living Dashboard",
      total_cards: cards.length,
      cards: cards.map((c) => ({
        id: c.id,
        title: c.title,
        type: c.card_type,
        query: c.query_text,
        content: c.content,
        pinned_at: c.created_at,
      })),
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `querylens_dashboard_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBoardRefresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  function formatCardDate(dateStr?: string) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString(intl, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="dashboard-board-canvas" dir={isAr ? "rtl" : "ltr"}>
      {/* Top Banner / Hero */}
      <header className="board-header">
        <div className="board-heading">
          <div className="board-badge">
            <LayoutGrid size={14} />
            <span>{t.eyebrow}</span>
          </div>
          <h1>
            {t.title}
            <span className="board-count-pill">{t.totalCards(cards.length)}</span>
          </h1>
          <p className="board-subtitle">{t.subtitle}</p>
        </div>

        <div className="board-top-actions">
          <Button
            variant="ghost"
            size="plain"
            className="secondary-btn"
            onClick={handleBoardRefresh}
            disabled={refreshing}
            title={t.refreshCard}
          >
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>

          <Button
            variant="ghost"
            size="plain"
            className="secondary-btn"
            onClick={handleExportBoard}
            disabled={cards.length === 0}
            title={t.exportBoard}
          >
            <Download size={14} />
            <span>{t.exportBoard}</span>
          </Button>

          {onStartChat && (
            <Button
              variant="ghost"
              size="plain"
              className="primary-btn"
              onClick={() => onStartChat()}
            >
              <Sparkles size={14} />
              <span>{dictionary.workspace.startChat}</span>
            </Button>
          )}
        </div>
      </header>

      {/* Control Bar: Search, Type Tabs, and NL Filter */}
      <div className="board-controls-bar">
        {/* Type Filter Tabs */}
        <div className="board-type-tabs" role="tablist">
          <Button
            variant="ghost"
            size="plain"
            className={`tab-btn ${typeFilter === "all" ? "active" : ""}`}
            onClick={() => setTypeFilter("all")}
          >
            <Layers size={13} />
            <span>{t.filterAll}</span>
            <span className="tab-badge">{counts.all}</span>
          </Button>
          <Button
            variant="ghost"
            size="plain"
            className={`tab-btn ${typeFilter === "chart" ? "active" : ""}`}
            onClick={() => setTypeFilter("chart")}
          >
            <BarChart3 size={13} />
            <span>{t.filterCharts}</span>
            <span className="tab-badge">{counts.chart}</span>
          </Button>
          <Button
            variant="ghost"
            size="plain"
            className={`tab-btn ${typeFilter === "report" ? "active" : ""}`}
            onClick={() => setTypeFilter("report")}
          >
            <FileText size={13} />
            <span>{t.filterReports}</span>
            <span className="tab-badge">{counts.report}</span>
          </Button>
          <Button
            variant="ghost"
            size="plain"
            className={`tab-btn ${typeFilter === "table" ? "active" : ""}`}
            onClick={() => setTypeFilter("table")}
          >
            <Table2 size={13} />
            <span>{t.filterTables}</span>
            <span className="tab-badge">{counts.table}</span>
          </Button>
        </div>

        {/* Search Input */}
        <div className="board-search-wrap">
          <Search size={14} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="board-search-input"
          />
        </div>
      </div>

      {/* Natural Language Dashboard Modifier */}
      <div className="board-nl-modifier">
        <div className="nl-icon">
          <Sparkles size={15} />
        </div>
        <div className="nl-input-wrap">
          <Input
            value={nlFilter}
            onChange={(e) => setNlFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAppliedNlFilter(nlFilter);
              }
            }}
            placeholder={t.filterBoardNLPlaceholder}
            className="nl-input"
          />
        </div>
        <Button
          variant="ghost"
          size="plain"
          className="nl-apply-btn"
          onClick={() => setAppliedNlFilter(nlFilter)}
        >
          {t.filterBoardApply}
        </Button>
        {appliedNlFilter && (
          <Button
            variant="ghost"
            size="plain"
            className="nl-clear-btn"
            onClick={() => {
              setNlFilter("");
              setAppliedNlFilter("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {appliedNlFilter && (
        <div className="board-active-filter-banner">
          <Filter size={13} />
          <span>Active Board Filter: &ldquo;{appliedNlFilter}&rdquo;</span>
          <span className="match-count">({filteredCards.length} matching cards)</span>
        </div>
      )}

      {/* Main Grid or Empty State */}
      {filteredCards.length === 0 ? (
        <div className="board-empty-state">
          <div className="empty-icon-circle">
            <LayoutGrid size={36} />
          </div>
          <h3>{cards.length === 0 ? t.emptyTitle : t.noMatch}</h3>
          <p className="empty-desc">{cards.length === 0 ? t.emptyText : t.searchPlaceholder}</p>
          {cards.length === 0 && onStartChat && (
            <Button
              variant="ghost"
              size="plain"
              className="primary-btn"
              onClick={() => onStartChat()}
            >
              <Sparkles size={15} />
              <span>{dictionary.workspace.startChat}</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="board-cards-grid">
          {filteredCards.map((card) => {
            const isEditing = editingCardId === card.id;
            const isCopied = copiedId === card.id;

            return (
              <article key={card.id} className={`board-card board-card-${card.card_type}`}>
                {/* Card Header */}
                <div className="board-card-header">
                  <div className="card-type-indicator">
                    {card.card_type === "chart" && <BarChart3 size={15} />}
                    {card.card_type === "report" && <FileText size={15} />}
                    {card.card_type === "table" && <Table2 size={15} />}
                    {card.card_type === "metric" && <TrendingUp size={15} />}
                    <span className="type-label">
                      {t.cardTypes[card.card_type] || card.card_type}
                    </span>
                  </div>

                  <div className="card-actions">
                    {card.query_text && (
                      <Button
                        variant="ghost"
                        size="plain"
                        className="card-action-btn"
                        onClick={() => handleCopyQuery(card)}
                        title={isCopied ? t.copied : t.copyQuery}
                      >
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      </Button>
                    )}

                    {card.session_id && onOpenSession && (
                      <Button
                        variant="ghost"
                        size="plain"
                        className="card-action-btn"
                        onClick={() => onOpenSession(card.session_id!)}
                        title={t.openChat}
                      >
                        <ExternalLink size={14} />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="plain"
                      className="card-action-btn delete-btn"
                      onClick={() => handleRemove(card.id)}
                      disabled={deletingId === card.id}
                      title={t.unpin}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {/* Card Title (with inline rename) */}
                <div className="board-card-title-bar">
                  {isEditing ? (
                    <div className="rename-form">
                      <Input
                        value={editTitleValue}
                        onChange={(e) => setEditTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(card.id);
                          if (e.key === "Escape") setEditingCardId(null);
                        }}
                        autoFocus
                        className="rename-input"
                      />
                      <Button
                        variant="ghost"
                        size="plain"
                        className="rename-save-btn"
                        onClick={() => handleRename(card.id)}
                      >
                        <Check size={14} />
                      </Button>
                    </div>
                  ) : (
                    <div className="title-row">
                      <h3
                        className="card-title"
                        title={card.title}
                        onDoubleClick={() => {
                          setEditingCardId(card.id);
                          setEditTitleValue(card.title);
                        }}
                      >
                        {card.title}
                      </h3>
                      <button
                        className="edit-title-btn"
                        onClick={() => {
                          setEditingCardId(card.id);
                          setEditTitleValue(card.title);
                        }}
                        title="Rename card"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}

                  {card.query_text && (
                    <p className="card-query-snippet" title={card.query_text}>
                      {card.query_text}
                    </p>
                  )}
                </div>

                {/* Card Content Body */}
                <div className="board-card-body">
                  {card.card_type === "chart" && card.content && (
                    <div className="chart-canvas-wrap">
                      <GraphView chart={card.content} />
                    </div>
                  )}

                  {card.card_type === "report" && card.content && (
                    <div className="report-canvas-wrap">
                      <WrittenAnalysis report={card.content} />
                    </div>
                  )}

                  {card.card_type === "table" && card.content?.rows && (
                    <div className="table-canvas-wrap">
                      <div className="table-scroll-container">
                        <table>
                          <thead>
                            <tr>
                              {(card.content.columns || []).map((col: any) => (
                                <th key={col.key}>{col.label || col.key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {card.content.rows.slice(0, 10).map((row: any, rIdx: number) => (
                              <tr key={rIdx}>
                                {(card.content.columns || []).map((col: any) => (
                                  <td key={col.key}>
                                    {row[col.key] === null ? (
                                      <span className="null-val">NULL</span>
                                    ) : (
                                      String(row[col.key])
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {card.content.rows.length > 10 && (
                        <div className="table-more-hint">
                          Showing first 10 of {card.content.rows.length} rows
                        </div>
                      )}
                    </div>
                  )}

                  {card.card_type === "metric" && (
                    <div className="metric-canvas-wrap">
                      <div className="metric-big-number">
                        {typeof card.content?.value === "number"
                          ? card.content.value.toLocaleString(intl)
                          : String(card.content?.value || card.content?.answer || "—")}
                      </div>
                      {card.content?.label && (
                        <div className="metric-sub-label">{card.content.label}</div>
                      )}
                      {card.content?.answer && (
                        <p className="metric-answer-text">{card.content.answer}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="board-card-footer">
                  <div className="footer-left">
                    <span className="dot dot-live" />
                    <span className="tethered-label">Living Insight</span>
                  </div>
                  {card.created_at && (
                    <div className="footer-date">
                      <Calendar size={11} />
                      <time dateTime={card.created_at}>{formatCardDate(card.created_at)}</time>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
