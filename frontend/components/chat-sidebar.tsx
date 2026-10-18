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
import type { Cube, Session } from "@/lib/api";
import { LanguageSwitch, useT } from "@/lib/i18n/client";

export function ChatSidebar({
  leftOpen,
  rightOpen,
  busy,
  cubes,
  sessions,
  session,
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
  onClose: () => void;
  onNewChat: () => void;
  onOpenSession: (session: Session) => void;
  onSignOut: () => void;
}) {
  const { t: dictionary, intl } = useT();
  const t = dictionary.chats;
  const [chatSearch, setChatSearch] = useState("");
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
          cube<span className="muted">/</span>chat
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
      <div className="workspace-label">
        <span className="workspace-avatar">A</span>
        <div>
          {t.workspace}
          <small>{t.workspaceHint}</small>
        </div>
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
        <History size={13} /> {t.history} <span>{sessions.length}</span>
      </div>
      <div className="session-list">
        {sessions
          .filter((item) =>
            (
              cubes.find((c) => c.id === item.cube_id)?.definition.name ||
              t.fallbackName
            )
              .toLowerCase()
              .includes(chatSearch.toLowerCase()),
          )
          .map((item) => (
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
              <span>
                {cubes.find((c) => c.id === item.cube_id)?.definition.name ||
                  t.fallbackName}
                <small>
                  {new Date(item.created_at).toLocaleDateString(intl, {
                    month: "short",
                    day: "numeric",
                  })}
                </small>
              </span>
            </Button>
          ))}
        {!sessions.length && (
          <div className="history-empty">
            <MessageSquare size={25} />
            <p>{t.emptyTitle}</p>
            <small>{t.emptyText}</small>
          </div>
        )}
        {!!sessions.length &&
          !sessions.some((item) =>
            (
              cubes.find((c) => c.id === item.cube_id)?.definition.name ||
              t.fallbackName
            )
              .toLowerCase()
              .includes(chatSearch.toLowerCase()),
          ) && <p className="sidebar-hint">{t.noMatch}</p>}
      </div>
      <div className="sidebar-bottom">
        <span>
          <span className="dot" /> {t.source}
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
