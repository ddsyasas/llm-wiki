"use client";

import { useEffect, useState } from "react";

type SourceItem = {
  id: string;
  filename: string;
  originalName: string | null;
  format: string;
  sizeBytes: number;
  addedAt: string;
  ingestedAt: string | null;
  url: string | null;
  title: string | null;
  pageCount: number;
};

// Format icons stay in plain text — easier on the eye than emoji for a
// reading-first product, and matches the rest of the app's chrome.
const FORMAT_LABEL: Record<string, string> = {
  markdown: "MD",
  text: "TXT",
  html: "HTML",
  url: "URL",
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  xlsx: "XLSX",
  image: "IMG",
};

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type Props = {
  // Bumping this from the parent forces a re-fetch after a successful ingest.
  refreshNonce: number;
};

export function SourcesList({ refreshNonce }: Props) {
  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/sources", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { sources: SourceItem[] };
        if (!cancelled) setSources(data.sources);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  if (error) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Could not load sources: {error}
      </p>
    );
  }

  if (sources === null) {
    return <p className="text-sm text-muted-foreground">Loading sources…</p>;
  }

  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing ingested yet. Use the form below to add your first source.
      </p>
    );
  }

  // Newest first — most recent ingest is what the user usually wants to see.
  const sorted = [...sources].sort((a, b) =>
    a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0,
  );

  return (
    <ul className="divide-y divide-border">
      {sorted.map((s) => {
        const label =
          s.title?.trim() ||
          s.originalName?.trim() ||
          s.url?.trim() ||
          s.filename;
        const formatBadge = FORMAT_LABEL[s.format] ?? s.format.toUpperCase();
        const isPending = s.ingestedAt === null;
        return (
          <li
            key={s.id}
            className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                <span className="font-mono">{formatBadge}</span>
                {" · "}
                {formatSize(s.sizeBytes)}
                {" · added "}
                {relativeDate(s.addedAt)}
                {s.url ? (
                  <>
                    {" · "}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      source
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <div className="shrink-0 text-right text-[11px]">
              {isPending ? (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                  pending
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {s.pageCount} page{s.pageCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
