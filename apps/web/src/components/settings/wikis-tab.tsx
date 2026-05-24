"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { SCHEMA_TEMPLATES, type SchemaTemplateId } from "@llm-wiki/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type WikiDetail = {
  path: string;
  topic: string | null;
  exists: boolean;
};

type ListResponse = {
  active: WikiDetail;
  recents: WikiDetail[];
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
  const [newTemplate, setNewTemplate] = useState<SchemaTemplateId>("blank");

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
      { type: "create", path, topic, templateId: newTemplate },
      `Created wiki at ${path}${newTemplate !== "blank" ? ` from "${newTemplate}" template` : ""}`,
    );
    if (ok) {
      setNewTopic("");
      setNewPath("");
      setNewTemplate("blank");
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

  const active = data?.active;
  const rows = data?.recents ?? [];
  const activeIsInRecents = active ? rows.some((r) => r.path === active.path) : false;

  // Stale entries left over from prior testing or removed-from-disk wikis.
  // Surface a single bulk-cleanup affordance so users don't have to click
  // Remove on each one.
  const missing = rows.filter((r) => !r.exists);

  async function onCleanMissing() {
    if (missing.length === 0) return;
    if (
      !confirm(
        `Remove ${missing.length} missing folder${missing.length === 1 ? "" : "s"} from the picker? (These rows point to paths that no longer exist on disk.)`,
      )
    )
      return;
    setBusyAction("clean-missing");
    setError(null);
    setFlash(null);
    try {
      // Sequential — small N + we want each remove to see the prior's
      // updated config, since removing the currently-active wiki resets it.
      for (const m of missing) {
        const res = await fetch("/api/wikis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "remove", path: m.path }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
      }
      setFlash(`Cleaned up ${missing.length} missing entr${missing.length === 1 ? "y" : "ies"}.`);
      await refresh();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

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

      {missing.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="text-amber-800 dark:text-amber-200">
            {missing.length} entr{missing.length === 1 ? "y points" : "ies point"} to folder
            {missing.length === 1 ? "" : "s"} that no longer exist on disk (likely leftover
            from earlier sessions).
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onCleanMissing()}
            disabled={busyAction !== null}
          >
            {busyAction === "clean-missing"
              ? "Cleaning…"
              : `Clean up ${missing.length} missing`}
          </Button>
        </div>
      ) : null}

      {/* If the active wiki isn't in the recents list (typical on first run —
          the default ~/llm-wiki-default), render it as its own row. We now
          use the server-enriched detail so topic + exists are correct. */}
      {active && !activeIsInRecents ? (
        <WikiRow
          path={active.path}
          topic={active.topic}
          exists={active.exists}
          isActive={true}
          busyAction={busyAction}
          onSwitch={() => Promise.resolve()}
          onRemove={() =>
            onRemove(active.path, true)
          }
        />
      ) : null}

      <ul className="space-y-2">
        {rows.map((row) => (
          <WikiRow
            key={row.path}
            path={row.path}
            topic={row.topic}
            exists={row.exists}
            isActive={active?.path === row.path}
            busyAction={busyAction}
            onSwitch={() => onSwitch(row.path)}
            onRemove={() => onRemove(row.path, active?.path === row.path)}
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
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="new-template">
                Schema template
              </label>
              <select
                id="new-template"
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value as SchemaTemplateId)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {SCHEMA_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {SCHEMA_TEMPLATES.find((t) => t.id === newTemplate)?.description}{" "}
                Pre-fills <code className="font-mono">CLAUDE.md</code> — edit any time in
                Settings → Schema.
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
