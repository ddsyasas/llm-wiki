"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "@/components/wiki/markdown-view";
import { PromoteMessageDialog } from "@/components/chats/promote-message";
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

type ChatMessage = {
  role: "user" | "assistant";
  time: string;
  content: string;
};

type ChatPayload = { row: ChatRow; messages: ChatMessage[] };

type Props = {
  chatId: string;
  initialChat: ChatPayload;
  knownSlugs: ReadonlyArray<string>;
  folders: ReadonlyArray<string>;
};

export function ChatView({ chatId, initialChat, knownSlugs, folders }: Props) {
  const router = useRouter();
  const [chat, setChat] = useState<ChatPayload>(initialChat);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialChat.row.title);
  const [moveOpen, setMoveOpen] = useState(false);
  const [promoteFor, setPromoteFor] = useState<ChatMessage | null>(null);

  // "Ingest whole chat as a source" — implements docs/06 §"Special case:
  // chats as sources". Runs the same ingest pipeline as a pasted text source
  // so a long, useful thread can be promoted into the wiki layer all at once
  // (vs. promoting one assistant message at a time).
  const [ingestingChat, setIngestingChat] = useState(false);
  const [ingestChatResult, setIngestChatResult] = useState<null | {
    newPages: Array<{ slug: string; title: string }>;
    updatedPages: Array<{ slug: string }>;
  }>(null);
  const [ingestChatError, setIngestChatError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages.length, busy]);

  const folderChoices = useMemo(
    () => folders.filter((f) => f !== chat.row.folder),
    [folders, chat.row.folder],
  );

  async function refreshChat() {
    const res = await fetch(`/api/chats/${chatId}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as ChatPayload;
      setChat(data);
    }
  }

  async function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    setSendError(null);
    const optimisticUser: ChatMessage = {
      role: "user",
      time: new Date().toLocaleTimeString("en-GB"),
      content: input,
    };
    setChat((prev) => ({ ...prev, messages: [...prev.messages, optimisticUser] }));
    const sent = input;
    setInput("");
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: sent }),
      });
      const json = (await res.json()) as { ok?: true; assistant?: ChatMessage; error?: string };
      if (!res.ok || !json.ok || !json.assistant) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      // Re-read the chat so we get the canonical message list with server-side
      // timestamps + row metadata.
      await refreshChat();
      router.refresh(); // bumps the sidebar
    } catch (err) {
      setSendError((err as Error).message);
      // Roll back the optimistic user message so the user can retry.
      setChat((prev) => ({ ...prev, messages: prev.messages.slice(0, -1) }));
      setInput(sent);
    } finally {
      setBusy(false);
    }
  }

  async function onRenameSave() {
    const t = draftTitle.trim();
    if (!t || t === chat.row.title) {
      setEditingTitle(false);
      return;
    }
    const res = await fetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    if (res.ok) {
      setChat((prev) => ({ ...prev, row: { ...prev.row, title: t } }));
      router.refresh();
    }
    setEditingTitle(false);
  }

  async function onMove(folder: string) {
    setMoveOpen(false);
    const res = await fetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    if (res.ok) {
      setChat((prev) => ({ ...prev, row: { ...prev.row, folder } }));
      router.refresh();
    }
  }

  async function onTogglePin() {
    const next = !chat.row.pinned;
    const res = await fetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    });
    if (res.ok) {
      setChat((prev) => ({ ...prev, row: { ...prev.row, pinned: next } }));
      router.refresh();
    }
  }

  async function onDelete() {
    if (!confirm(`Move "${chat.row.title}" to trash?`)) return;
    const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
      router.push("/chats");
    }
  }

  async function onIngestChat() {
    if (chat.messages.length === 0) return;
    if (
      !confirm(
        `Ingest this chat as a wiki source? The agent will read the whole conversation and may create or update wiki pages from it.`,
      )
    )
      return;
    setIngestingChat(true);
    setIngestChatError(null);
    setIngestChatResult(null);
    try {
      // Stringify messages the same way the chat file is stored so the LLM
      // sees a natural conversation transcript, not a JSON blob.
      const body = chat.messages
        .map((m) => `## ${m.role} [${m.time}]\n${m.content}`)
        .join("\n\n");
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: body,
          title: `Chat: ${chat.row.title}`,
        }),
      });
      const json = (await res.json()) as {
        ok?: true;
        response?: {
          newPages: Array<{ slug: string; title: string; type: string }>;
          pageUpdates: Array<{ slug: string; updateReason: string }>;
        };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.response) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setIngestChatResult({
        newPages: json.response.newPages.map((p) => ({ slug: p.slug, title: p.title })),
        updatedPages: json.response.pageUpdates.map((p) => ({ slug: p.slug })),
      });
    } catch (err) {
      setIngestChatError((err as Error).message);
    } finally {
      setIngestingChat(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="min-w-0">
          {editingTitle ? (
            <Input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={onRenameSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onRenameSave();
                if (e.key === "Escape") {
                  setDraftTitle(chat.row.title);
                  setEditingTitle(false);
                }
              }}
              className="h-8 text-base"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftTitle(chat.row.title);
                setEditingTitle(true);
              }}
              className="block text-left text-lg font-medium tracking-tight hover:underline"
              title="Click to rename"
            >
              {chat.row.pinned ? "★ " : ""}
              {chat.row.title}
            </button>
          )}
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {chat.row.folder} · {chat.messages.length} messages
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setMoveOpen((o) => !o)}>
              Move
            </Button>
            {moveOpen && folderChoices.length > 0 ? (
              <ul className="absolute right-0 z-10 mt-1 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-md">
                {folderChoices.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      onClick={() => onMove(f)}
                      className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    >
                      → {f}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={onTogglePin}>
            {chat.row.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onIngestChat}
            disabled={ingestingChat || chat.messages.length === 0}
            title="Run the whole chat through the ingest pipeline as a source"
          >
            {ingestingChat ? "Ingesting…" : "Ingest → wiki"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </header>

      {ingestChatResult ? (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-6 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <p>
            <strong>Filed back into the wiki.</strong>{" "}
            {ingestChatResult.newPages.length} new page
            {ingestChatResult.newPages.length === 1 ? "" : "s"},{" "}
            {ingestChatResult.updatedPages.length} updated.
          </p>
          {ingestChatResult.newPages.length > 0 ? (
            <p className="mt-1 text-xs">
              New:{" "}
              {ingestChatResult.newPages.map((p, i) => (
                <span key={p.slug}>
                  <a
                    href={`/wiki/${p.slug}`}
                    className="underline underline-offset-2"
                  >
                    {p.title}
                  </a>
                  {i < ingestChatResult.newPages.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
      {ingestChatError ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          Chat ingest failed: {ingestChatError}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {chat.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Empty thread. Ask the wiki a question to start it off.
          </p>
        ) : (
          <ol className="space-y-6">
            {chat.messages.map((m, i) => (
              <li key={`${m.time}-${i}`} className="space-y-1">
                <header className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5",
                      m.role === "user"
                        ? "bg-secondary text-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {m.role}
                  </span>
                  <span>{m.time}</span>
                  {m.role === "assistant" ? (
                    <button
                      type="button"
                      onClick={() => setPromoteFor(m)}
                      className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Save as wiki page →
                    </button>
                  ) : null}
                </header>
                <article
                  className={cn(
                    "rounded-lg border p-4 text-sm",
                    m.role === "user"
                      ? "border-border bg-background"
                      : "border-border bg-card",
                  )}
                >
                  <MarkdownView content={m.content} knownSlugs={knownSlugs} />
                </article>
              </li>
            ))}
          </ol>
        )}
        {busy ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Asking {chat.row.title} model…
          </p>
        ) : null}
        {sendError ? (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sendError}
          </p>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={onSend} className="border-t border-border bg-background p-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          rows={3}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void onSend();
            }
          }}
          className="text-base"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Cmd/Ctrl + Enter to send</p>
          <Button type="submit" disabled={!input.trim() || busy}>
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>

      {promoteFor ? (
        <PromoteMessageDialog
          message={promoteFor}
          chatTitle={chat.row.title}
          onClose={() => setPromoteFor(null)}
        />
      ) : null}
    </div>
  );
}
