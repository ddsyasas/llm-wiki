"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type WikiDetail = {
  path: string;
  topic: string | null;
  exists: boolean;
};

type ListResponse = {
  active: WikiDetail;
  recents: WikiDetail[];
};

// Sits next to the wordmark in the header. Shows the active wiki's topic
// as a chip; click → dropdown with quick-switch + manage actions. Full
// CRUD still lives in Settings → Wikis; this surface is for the
// everyday "I want to flip wikis" flow without leaving whatever page
// I'm on.
export function WikiSwitcher() {
  const router = useRouter();
  const [data, setData] = useState<ListResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/wikis", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as ListResponse;
      setData(json);
    } catch {
      // non-fatal — chip just shows a generic label
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Close on outside click + Escape so the dropdown behaves like a
  // proper menu.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onSwitch(path: string) {
    setSwitching(path);
    try {
      const res = await fetch("/api/wikis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "switch", path }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        // Soft failure — leave the dropdown open so the user can react.
        // eslint-disable-next-line no-alert
        alert(j.error ?? `Switch failed (HTTP ${res.status})`);
        return;
      }
      setOpen(false);
      await refresh();
      // Re-render every server component so the new wiki's data shows up
      // on whatever page the user is currently looking at.
      router.refresh();
    } finally {
      setSwitching(null);
    }
  }

  const activeTopic = data?.active.topic;
  // The chip text: prefer the topic, fall back to a short folder-name
  // hint so the chip is never empty even before settings exist.
  const chipLabel = activeTopic ?? friendlyFolderName(data?.active.path);
  // Other wikis = recents minus the active one. Sorted by topic when
  // available, else by path.
  const others = (data?.recents ?? [])
    .filter((w) => w.path !== data?.active.path && w.exists)
    .sort((a, b) => {
      const at = a.topic ?? a.path;
      const bt = b.topic ?? b.path;
      return at.localeCompare(bt);
    });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex max-w-[14rem] items-center gap-1.5 rounded-md border border-border/60 bg-secondary/40 px-2 py-1 text-[12px] text-foreground/80 transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground",
          open && "border-border bg-secondary/60",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        title={data?.active.path ?? "Active wiki"}
      >
        <span aria-hidden className="text-muted-foreground">⌂</span>
        <span className="truncate">{chipLabel}</span>
        <span aria-hidden className="text-muted-foreground/70">▾</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1.5 w-[280px] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Active wiki
            </p>
            <p className="mt-0.5 truncate text-sm font-medium">{chipLabel}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {data?.active.path}
            </p>
          </div>

          {others.length > 0 ? (
            <div className="border-b border-border py-1">
              <p className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Switch to
              </p>
              <ul>
                {others.map((w) => {
                  const isLoading = switching === w.path;
                  return (
                    <li key={w.path}>
                      <button
                        type="button"
                        onClick={() => void onSwitch(w.path)}
                        disabled={switching !== null}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent/60 disabled:opacity-60"
                      >
                        <span className="truncate">
                          {w.topic ?? friendlyFolderName(w.path)}
                        </span>
                        {isLoading ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            switching…
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="py-1">
            <Link
              href="/settings?tab=wikis"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-sm hover:bg-accent/60"
            >
              + Create new wiki
            </Link>
            <Link
              href="/settings?tab=wikis"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-sm hover:bg-accent/60"
            >
              Manage wikis…
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function friendlyFolderName(path?: string): string {
  if (!path) return "Default wiki";
  const parts = path.split("/");
  const last = parts[parts.length - 1] || path;
  return last;
}
