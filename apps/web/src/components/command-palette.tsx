"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Action = {
  id: string;
  label: string;
  hint?: string;
  group: "Pages" | "Chats" | "Go to";
  href: string;
};

const STATIC_ACTIONS: Action[] = [
  { id: "go-wiki", label: "Wiki", hint: "browse pages", group: "Go to", href: "/wiki" },
  { id: "go-sources", label: "Sources", hint: "add a source", group: "Go to", href: "/sources" },
  { id: "go-query", label: "Query", hint: "ask a question", group: "Go to", href: "/query" },
  { id: "go-chats", label: "Chats", hint: "start or open a chat", group: "Go to", href: "/chats" },
  { id: "go-lint", label: "Lint", hint: "wiki health check", group: "Go to", href: "/lint" },
  { id: "go-schema", label: "Schema editor", hint: "edit CLAUDE.md", group: "Go to", href: "/schema" },
  { id: "go-settings", label: "Settings", hint: "models, theme, API key", group: "Go to", href: "/settings" },
];

type PageItem = { slug: string; title: string };
type ChatItem = { id: string; title: string; folder: string };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Global keyboard handler: Cmd/Ctrl+K toggles, Cmd/Ctrl+, opens Settings.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (cmd && e.key === ",") {
        e.preventDefault();
        setOpen(false);
        router.push("/settings");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Fetch on open. Cached for the rest of the session via the closure.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    void (async () => {
      try {
        const [pagesRes, chatsRes] = await Promise.all([
          fetch("/api/pages", { cache: "no-store" }),
          fetch("/api/chats", { cache: "no-store" }),
        ]);
        if (pagesRes.ok) {
          const data = (await pagesRes.json()) as { pages: PageItem[] };
          setPages(data.pages.map((p) => ({ slug: p.slug, title: p.title })));
        }
        if (chatsRes.ok) {
          const data = (await chatsRes.json()) as { chats: ChatItem[] };
          setChats(
            data.chats.map((c) => ({ id: c.id, title: c.title, folder: c.folder })),
          );
        }
      } catch {
        // ignore — input still works against the actions list
      }
      // Focus after data fetch so it doesn't steal focus from typing the user
      // started before we mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    })();
  }, [open]);

  const items = useMemo<Action[]>(() => {
    const pageActions: Action[] = pages.map((p) => ({
      id: `page-${p.slug}`,
      label: p.title,
      hint: p.slug,
      group: "Pages",
      href: `/wiki/${p.slug}`,
    }));
    const chatActions: Action[] = chats.map((c) => ({
      id: `chat-${c.id}`,
      label: c.title,
      hint: c.folder,
      group: "Chats",
      href: `/chats/${c.id}`,
    }));
    const combined = [...STATIC_ACTIONS, ...pageActions, ...chatActions];
    const needle = query.trim().toLowerCase();
    if (!needle) return combined;
    return combined.filter(
      (a) =>
        a.label.toLowerCase().includes(needle) ||
        (a.hint?.toLowerCase().includes(needle) ?? false),
    );
  }, [pages, chats, query]);

  const grouped = useMemo(() => {
    const map = new Map<Action["group"], Action[]>();
    for (const item of items) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [items]);

  const flatItems = items; // for index-based navigation

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  function navigate(item: Action) {
    close();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatItems.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = flatItems[activeIndex];
      if (pick) navigate(pick);
    }
  }

  // Keep the active item in view as the user arrows down.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let runningIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, chat, or screen…"
            className="h-10 border-0 bg-transparent text-base focus-visible:ring-0"
          />
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {flatItems.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              No matches.
            </li>
          ) : (
            Array.from(grouped.entries()).map(([group, list]) => (
              <li key={group}>
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                <ul>
                  {list.map((item) => {
                    const idx = runningIndex++;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          data-idx={idx}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => navigate(item)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                            activeIndex === idx ? "bg-accent" : "hover:bg-accent/60",
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                          {item.hint ? (
                            <span className="shrink-0 truncate text-xs text-muted-foreground">
                              {item.hint}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          ↑↓ navigate · ⏎ open · esc close · ⌘K toggle
        </div>
      </div>
    </div>
  );
}
