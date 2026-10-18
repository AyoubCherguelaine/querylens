"use client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Database,
  X,
  Plus,
  Search,
  History,
  MessageSquare,
  LogOut,
} from "lucide-react";
import type { Cube, Session, Source } from "@/lib/api";
import { LanguageSwitch, useT } from "@/lib/i18n/client";

export function ChatSidebar({
  leftOpen,
  rightOpen,
  busy,
  cubes,
  sessions,
  session,
  activeSource,
  onClose,
  onNewChat,
  onOpenSession,
  onSignOut,
}: {
  leftOpen: boolean;
  rightOpen: boolean;
  busy: boolean;
  cubes: Cube[];
  sessions: Session[];
  session: string;
  activeSource?: Source;
  onClose: () => void;
  onNewChat: () => void;
  onOpenSession: (session: Session) => void;
  onSignOut: () => void;
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.chats;
  const [chatSearch, setChatSearch] = useState("");
  function sessionName(item: Session) {
    const ids = item.cube_ids?.length ? item.cube_ids : [item.cube_id];
    return (
      ids
        .map((id) => cubes.find((c) => c.id === id)?.definition.name)
        .filter(Boolean)
        .join(" + ") || t.fallbackName
    );
  }
  function formatDate(value: string) {
    const date = new Date(value);
    const now = new Date();
    const sameDay =
      date.toLocaleDateString(intl) === now.toLocaleDateString(intl);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay) return t.today;
    if (date.toLocaleDateString(intl) === yesterday.toLocaleDateString(intl))
      return t.yesterday;
    return date.toLocaleDateString(intl, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
  }
  const sourceKind = activeSource ? t.sourceKind(activeSource.kind) : "";
  const filtered = sessions.filter((item) =>
    sessionName(item).toLowerCase().includes(chatSearch.toLowerCase()),
  );
  return (
    <aside
      id="chat-sidebar"
      className={`sidebar chat-sidebar ${leftOpen ? "is-open" : ""}`}
      aria-label={t.label}
      role={leftOpen ? "dialog" : undefined}
      aria-modal={leftOpen || undefined}
      inert={rightOpen}
    >
      <div className="brand">
        <span className="brand-mark">
          <Database size={19} />
        </span>
        <bdi className="brand-name" dir="ltr">
          Query<span className="muted">Lens</span>
        </bdi>
        <Button
          variant="ghost"
          size="plain"
          className="icon-button drawer-close"
          aria-label={t.close}
          onClick={() => onClose()}
        >
          <X size={18} />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="plain"
        className="primary new-chat"
        disabled={busy}
        onClick={() => onNewChat()}
      >
        <Plus size={17} /> {t.newChat}
      </Button>
      <label className="sidebar-search">
        <Search size={15} />
        <Input
          aria-label={t.search}
          placeholder={t.searchPlaceholder}
          value={chatSearch}
          onChange={(e) => setChatSearch(e.target.value)}
        />
      </label>
      <div className="section-label">
        <History size={13} /> {t.history}
        <span className="chat-count">{filtered.length}</span>
      </div>
      <div className="session-list">
        {filtered.map((item) => (
          <Button
            variant="ghost"
            size="plain"
            className={session === item.id ? "active" : ""}
            aria-current={session === item.id ? "page" : undefined}
            disabled={busy}
            key={item.id}
            onClick={() => onOpenSession(item)}
          >
            <MessageSquare size={16} />
            <span className="session-cell">
              <span
                className="session-name"
                title={sessionName(item)}
              >
                {sessionName(item)}
              </span>
              <time className="session-date" dateTime={item.created_at}>
                {formatDate(item.created_at)}
              </time>
            </span>
          </Button>
        ))}
        {!sessions.length && (
          <div className="history-empty">
            <MessageSquare size={26} />
            <p>{t.emptyTitle}</p>
            <small>{t.emptyText}</small>
          </div>
        )}
        {!!sessions.length && !filtered.length && (
          <p className="sidebar-hint">{t.noMatch}</p>
        )}
      </div>
      <div className="sidebar-bottom">
        <span className="source-info">
          <span className="dot" />
          <span className="source-name">
            {activeSource?.schema_name || t.source}
          </span>
          {!!sourceKind && <span className="source-kind">{sourceKind}</span>}
        </span>
        <LanguageSwitch />
        <Button
          variant="ghost"
          size="plain"
          className="icon-button"
          aria-label={t.signOut}
          disabled={busy}
          onClick={onSignOut}
        >
          <LogOut size={17} />
        </Button>
      </div>
    </aside>
  );
}
