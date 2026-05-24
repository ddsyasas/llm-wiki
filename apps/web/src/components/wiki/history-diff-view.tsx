"use client";

import { diffLines, type Change } from "diff";
import Link from "next/link";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

type Backup = {
  filename: string;
  timestamp: string;
  sizeBytes: number;
};

type Props = {
  slug: string;
  currentContent: string;
  currentTitle: string;
  backups: ReadonlyArray<Backup>;
  selectedFilename: string | null;
  backupContent: string | null;
};

function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMin = Math.floor((Date.now() - t) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 16);
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

// Renders a unified line-by-line diff: backup (old) vs current page body.
// Green lines = added in current vs backup; red lines = removed; unchanged
// lines render in muted context. Plain CSS — no diff-viewer dep, keeps the
// page render under 100ms even for long pages.
export function HistoryDiffView({
  slug,
  currentContent,
  backups,
  selectedFilename,
  backupContent,
}: Props) {
  const changes = useMemo<Change[]>(() => {
    if (backupContent === null) return [];
    return diffLines(backupContent, currentContent);
  }, [backupContent, currentContent]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const c of changes) {
      if (c.added) added += c.count ?? 0;
      else if (c.removed) removed += c.count ?? 0;
    }
    return { added, removed };
  }, [changes]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
      {/* Backup picker — newest first. Clicking a row deep-links via
          ?backup= so the URL is shareable / bookmarkable. */}
      <aside>
        <p className="mb-2 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
          Backups ({backups.length})
        </p>
        <ul className="space-y-1">
          {backups.map((b) => {
            const isSelected = b.filename === selectedFilename;
            return (
              <li key={b.filename}>
                <Link
                  href={`/wiki/${slug}/history?backup=${encodeURIComponent(b.filename)}`}
                  prefetch={false}
                  className={cn(
                    "block rounded-md border px-3 py-2 text-xs transition-colors",
                    isSelected
                      ? "border-primary/50 bg-primary/[0.06]"
                      : "border-border/70 bg-card hover:border-border",
                  )}
                >
                  <p className="font-mono text-[11px]">{b.timestamp.slice(0, 16)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {relativeDate(b.timestamp)} · {formatSize(b.sizeBytes)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Diff panel — left-bordered card with the actual diff content. */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-caption text-muted-foreground">
            <strong className="text-foreground">Diff</strong> — selected backup
            vs current page body
          </p>
          {backupContent !== null ? (
            <p className="text-caption text-muted-foreground">
              <span className="text-emerald-700 dark:text-emerald-300">
                +{stats.added}
              </span>{" "}
              ·{" "}
              <span className="text-destructive">−{stats.removed}</span>
              {" lines"}
            </p>
          ) : null}
        </div>
        {backupContent === null ? (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Couldn&apos;t read the selected backup file.
          </p>
        ) : changes.length === 0 ? (
          <p className="rounded-md border border-border/70 bg-card p-4 text-sm text-muted-foreground">
            No diff.
          </p>
        ) : (
          <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-3 font-mono text-[12px] leading-relaxed">
            {changes.map((c, i) => (
              <DiffChunk key={i} change={c} />
            ))}
          </pre>
        )}
      </section>
    </div>
  );
}

function DiffChunk({ change }: { change: Change }) {
  // Render each line individually so the bg color stripe is per-line.
  const lines = change.value.split("\n");
  // diffLines tends to leave a trailing empty string for a final newline;
  // skip rendering it so we don't get an extra blank stripe.
  const usable = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const bg = change.added
    ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
    : change.removed
      ? "bg-destructive/10 text-destructive"
      : "text-foreground/80";
  const sigil = change.added ? "+" : change.removed ? "−" : " ";
  return (
    <>
      {usable.map((line, i) => (
        <div key={i} className={cn("px-2 py-px", bg)}>
          <span className="select-none pr-2 opacity-50">{sigil}</span>
          {line || " "}
        </div>
      ))}
    </>
  );
}
