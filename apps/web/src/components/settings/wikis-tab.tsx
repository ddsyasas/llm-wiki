"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RecentDetail = {
  path: string;
  topic: string | null;
  exists: boolean;
};

type ListResponse = {
  active: string;
  recents: RecentDetail[];
};

// Suggests a default folder path from a topic. Matches the convention
// `~/llm-wiki-<slug>` so users have a sensible starting point without
// having to type a full path.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function suggestedPath(topic: string): string {
  const slug = slugify(topic);
  if (!slug) return "~/llm-wiki-untitled";
  return `~/llm-wiki-${slug}`;
}

export function WikisTab() {
  const router = useRouter();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newPath, setNewPath] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/wikis", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ListResponse;
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function doAction(
    label: string,
    body: object,
    successFlash: string,
  ): Promise<boolean> {
    setBusyAction(label);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/wikis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setFlash(successFlash);
      await refresh();
      // Re-render every server component so the new active wiki is read
      // throughout the app, not just by this tab.
      router.refresh();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function onSwitch(path: string) {
    await doAction(`switch:${path}`, { type: "switch", path }, `Switched to ${path}`);
  }

  async function onRemove(path: string, isActive: boolean) {
    const msg = isActive
      ? `Remove this wiki from the picker AND switch back to the default? The folder + files stay on disk.`
      : `Remove this wiki from the picker? The folder + files stay on disk.`;
    if (!confirm(msg)) return;
    await doAction(`remove:${path}`, { type: "remove", path }, "Removed from picker");
  }

  async function onCreate() {
    const topic = newTopic.trim();
    const path = newPath.trim() || suggestedPath(topic);
    if (!topic) {
      setError("Topic is required.");
      return;
    }
    const ok = await doAction(
      "create",
      { type: "create", path, topic },
      `Created wiki at ${path}`,
    );
    if (ok) {
      setNewTopic("");
      setNewPath("");
      setCreateOpen(false);
    }
  }

  if (data === null && !error) {
    return <p className="text-sm text-muted-foreground">Loading wikis…</p>;
  }

  if (error && data === null) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Could not load wikis: {error}
      </p>
    );
  }

  const rows = data?.recents ?? [];
  const activePath = data?.active ?? "";
  const activeIsInRecents = rows.some((r) => r.path === activePath);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Wikis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One wiki per topic. The active wiki is what the whole app reads from
          until you switch. Switching is two clicks — no restart needed.
        </p>
      </div>

      {flash ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {flash}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* If the active wiki isn't in the recents list (typical on first run —
          the default ~/llm-wiki-default), render it as its own row. */}
      {!activeIsInRecents ? (
        <WikiRow
          path={activePath}
          topic={null}
          exists={true}
          isActive={true}
          busyAction={busyAction}
          onSwitch={() => Promise.resolve()}
          onRemove={() => Promise.resolve()}
        />
      ) : null}

      <ul className="space-y-2">
        {rows.map((row) => (
          <WikiRow
            key={row.path}
            path={row.path}
            topic={row.topic}
            exists={row.exists}
            isActive={row.path === activePath}
            busyAction={busyAction}
            onSwitch={() => onSwitch(row.path)}
            onRemove={() => onRemove(row.path, row.path === activePath)}
          />
        ))}
      </ul>

      {/* Create form, collapsed by default. */}
      <div className="rounded-md border border-border/70 bg-muted/20 p-4">
        {!createOpen ? (
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            + Create new wiki
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Create a new wiki</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pick a topic (the LLM reads it on every operation) and a folder
                path. The folder is created if it doesn't exist.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="new-topic">
                Topic
              </label>
              <Input
                id="new-topic"
                value={newTopic}
                onChange={(e) => {
                  setNewTopic(e.target.value);
                  if (!newPath) setNewPath(suggestedPath(e.target.value));
                }}
                placeholder="e.g. Machine learning research and key papers"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="new-path">
                Folder path
              </label>
              <Input
                id="new-path"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder={newTopic ? suggestedPath(newTopic) : "~/llm-wiki-…"}
                className="font-mono text-[13px]"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Tilde (<code className="font-mono">~</code>) gets expanded to your home directory.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={!newTopic.trim() || busyAction === "create"}>
                {busyAction === "create" ? "Creating…" : "Create + switch"}
              </Button>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        After switching, every page in the app re-reads from the new wiki on its
        next request. Most surfaces update in-place; if anything looks stale,
        refresh the browser.
      </p>
    </div>
  );
}

function WikiRow({
  path,
  topic,
  exists,
  isActive,
  busyAction,
  onSwitch,
  onRemove,
}: {
  path: string;
  topic: string | null;
  exists: boolean;
  isActive: boolean;
  busyAction: string | null;
  onSwitch: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const switching = busyAction === `switch:${path}`;
  const removing = busyAction === `remove:${path}`;
  return (
    <li
      className={
        "flex flex-wrap items-baseline justify-between gap-3 rounded-md border p-3 " +
        (isActive ? "border-primary/40 bg-primary/[0.04]" : "border-border/70 bg-card")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium">
            {topic ?? <span className="text-muted-foreground italic">no topic set</span>}
          </p>
          {isActive ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
              active
            </span>
          ) : null}
          {!exists ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
              folder missing
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {path}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {!isActive && exists ? (
          <Button size="sm" variant="outline" onClick={() => void onSwitch()} disabled={busyAction !== null}>
            {switching ? "Switching…" : "Switch"}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void onRemove()} disabled={busyAction !== null}>
          {removing ? "Removing…" : "Remove"}
        </Button>
      </div>
    </li>
  );
}
