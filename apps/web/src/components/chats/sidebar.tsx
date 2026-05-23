"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ChatRow = {
  id: string;
  filename: string;
  folder: string;
  title: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  message_count: number;
};

export function ChatsSidebar() {
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [chatsRes, foldersRes] = await Promise.all([
        fetch("/api/chats", { cache: "no-store" }),
        fetch("/api/chats/folders", { cache: "no-store" }),
      ]);
      if (!chatsRes.ok) throw new Error(`/api/chats returned ${chatsRes.status}`);
      const chatsData = (await chatsRes.json()) as { chats: ChatRow[] };
      const foldersData = foldersRes.ok
        ? ((await foldersRes.json()) as { folders: string[] })
        : { folders: ["inbox"] };
      setChats(chatsData.chats);
      setFolders(foldersData.folders);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  async function onNewChat() {
    setCreating(true);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folder: "inbox" }),
      });
      if (!res.ok) throw new Error(`/api/chats POST returned ${res.status}`);
      const data = (await res.json()) as { chat: ChatRow };
      await refresh();
      router.push(`/chats/${data.chat.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const grouped = useMemo(() => {
    if (!chats) return null;
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? chats.filter((c) => c.title.toLowerCase().includes(needle))
      : chats;
    const byFolder = new Map<string, ChatRow[]>();
    for (const f of folders) byFolder.set(f, []);
    for (const c of filtered) {
      const list = byFolder.get(c.folder) ?? [];
      list.push(c);
      byFolder.set(c.folder, list);
    }
    for (const list of byFolder.values()) {
      list.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.updated_at < b.updated_at ? 1 : -1;
      });
    }
    return byFolder;
  }, [chats, folders, filter]);

  const activeId = pathname.startsWith("/chats/") ? pathname.slice("/chats/".length) : null;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-secondary/30">
      <div className="space-y-2 border-b border-border p-3">
        <Button onClick={onNewChat} disabled={creating} className="w-full">
          {creating ? "Creating…" : "+ New chat"}
        </Button>
        <Input
          type="search"
          placeholder="Filter chats…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-3 text-sm">
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {!chats && !error ? <p className="text-xs text-muted-foreground">Loading…</p> : null}

        {grouped
          ? Array.from(grouped.entries()).map(([folder, items]) => (
              <section key={folder} className="mb-4">
                <h3 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {folder} {items.length > 0 ? `(${items.length})` : null}
                </h3>
                {items.length === 0 ? (
                  <p className="px-2 text-xs text-muted-foreground/70">—</p>
                ) : (
                  <ul className="space-y-0.5">
                    {items.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/chats/${c.id}`}
                          className={cn(
                            "flex items-center justify-between gap-2 truncate rounded px-2 py-1.5",
                            activeId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                          )}
                          title={c.title}
                        >
                          <span className="truncate">{c.pinned ? "★ " : ""}{c.title}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {c.message_count}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          : null}
      </nav>
    </aside>
  );
}
