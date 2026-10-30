"use client";

import { useState } from "react";
import { Check, CheckCheck, Layers3, LoaderCircle, Plus, Search, X } from "lucide-react";
import type { Cube } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "./ui/popover";

export function ChatTables({
  primary,
  candidates,
  selectedIds,
  busy,
  onChange,
}: {
  primary: Cube;
  candidates: Cube[];
  selectedIds: string[];
  busy: boolean;
  onChange: (ids: string[]) => Promise<void>;
}) {
  const { t } = useT();
  const text = t.chatTables;
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const extra = candidates.filter(
    (c) => c.id !== primary.id && selectedIds.includes(c.id),
  );
  const allSelected =
    candidates.length > 1 &&
    candidates.every((c) => c.id === primary.id || selectedIds.includes(c.id));
  const matching = candidates.filter((c) =>
    `${c.definition.name} ${c.definition.schema}.${c.definition.table}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="chat-tables">
      <div className="chat-table-chips" aria-label={text.selected}>
        {allSelected ? (
          <span
            className="chat-table-chip all-selected"
            title={candidates.map((c) => c.definition.name).join(", ")}
          >
            <Layers3 size={13} />
            <strong>{text.allSelectedBadge(candidates.length)}</strong>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              aria-label={text.clearSelection}
              onClick={() => void onChange([])}
            >
              <X size={12} />
            </Button>
          </span>
        ) : (
          [primary, ...extra].map((cube) => (
            <span
              className="chat-table-chip"
              key={cube.id}
              title={`${cube.definition.schema}.${cube.definition.table}`}
            >
              {cube.definition.name}
              {cube.id !== primary.id && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={busy}
                  aria-label={text.remove(cube.definition.name)}
                  onClick={() =>
                    void onChange(selectedIds.filter((id) => id !== cube.id))
                  }
                >
                  <X size={12} />
                </Button>
              )}
            </span>
          ))
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              disabled={busy}
              className="add-chat-table"
              aria-label={text.add}
              title={text.add}
            />
          }
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Plus size={15} />
          )}
        </PopoverTrigger>
        <PopoverContent className="chat-table-picker" align="start" side="top">
          <PopoverTitle>{text.title}</PopoverTitle>
          <PopoverDescription>{text.description}</PopoverDescription>
          {candidates.length > 1 && (
            <div className="chat-table-batch-actions">
              <Button
                variant="outline"
                size="xs"
                disabled={busy || allSelected}
                className="select-all-btn"
                onClick={() =>
                  void onChange(candidates.map((c) => c.id))
                }
              >
                <CheckCheck size={13} />
                {text.selectAll(candidates.length)}
              </Button>
              {extra.length > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() => void onChange([])}
                >
                  {text.clearSelection}
                </Button>
              )}
            </div>
          )}
          <label className="chat-table-search">
            <Search size={15} />
            <Input
              autoFocus
              aria-label={text.search}
              placeholder={text.search}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="chat-table-options">
            {matching.map((cube) => {
              const included = selectedIds.includes(cube.id);
              const isPrimary = cube.id === primary.id;
              return (
                <Button
                  key={cube.id}
                  variant="ghost"
                  size="plain"
                  className="chat-table-option"
                  aria-pressed={included}
                  disabled={
                    busy || isPrimary || (!included && selectedIds.length >= 50)
                  }
                  onClick={() =>
                    void onChange(
                      included
                        ? selectedIds.filter((id) => id !== cube.id)
                        : [...selectedIds, cube.id],
                    )
                  }
                >
                  <span className="chat-table-check">
                    {included && <Check size={15} />}
                  </span>
                  <span>
                    <strong>{cube.definition.name}</strong>
                    <small dir="ltr">
                      {cube.definition.schema}.{cube.definition.table}
                    </small>
                  </span>
                  {isPrimary && <small>{text.primary}</small>}
                </Button>
              );
            })}
            {!matching.length && <p className="muted">{text.noMatch}</p>}
          </div>
          <small className="muted">{text.hint}</small>
        </PopoverContent>
      </Popover>
    </div>
  );
}
