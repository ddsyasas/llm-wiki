"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageContainer, PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Severity = "high" | "medium" | "low";
type IssueType =
  | "contradiction"
  | "orphan"
  | "missing-page"
  | "broken-link"
  | "gap"
  | "stale";

type LintIssue = {
  severity: Severity;
  type: IssueType;
  description: string;
  affectedPages: string[];
  suggestedFix: string | null;
  source: "local" | "llm";
};

type LintResult = {
  issues: LintIssue[];
  suggestedQuestions: string[];
  overallHealth: "excellent" | "good" | "fair" | "needs-work";
  truncated: boolean;
  totalPages: number;
  previousRun: {
    stamp: string;
    totalIssues: number;
    health: "excellent" | "good" | "fair" | "needs-work" | null;
  } | null;
};

type LintSuccess = { ok: true; model: string; result: LintResult };
type LintFailure = { ok?: false; error: string; type?: string };

type LintHistoryEntry = {
  stamp: string;
  totalIssues: number;
  health: "excellent" | "good" | "fair" | "needs-work" | null;
};

const HEALTH_STYLES: Record<LintResult["overallHealth"], string> = {
  excellent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fair: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "needs-work": "bg-destructive/10 text-destructive",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "bg-secondary text-secondary-foreground",
};

const TYPE_ORDER: IssueType[] = [
  "contradiction",
  "broken-link",
  "missing-page",
  "gap",
  "stale",
  "orphan",
];

function brokenLinkSlug(description: string): string | null {
  // Local broken-link descriptions are formatted "<title> links to [[<slug>]], which doesn't exist".
  const m = description.match(/\[\[([a-z0-9-]+)\]\]/);
  return m?.[1] ?? null;
}

// "2026-05-24 02:30" → "2h ago" / "yesterday" / "May 22". UTC-ish from the
// log stamp; close enough for human glance, not for billing.
function relativeFromLogStamp(stamp: string): string {
  // The stamp is "YYYY-MM-DD HH:MM" (no zone). Treat as UTC so we match what
  // appendLog wrote.
  const iso = stamp.replace(" ", "T") + ":00Z";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return stamp;
  const diffMin = Math.floor((Date.now() - t) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return stamp.slice(0, 10);
}

function missingPageSlug(description: string): string | null {
  // LLM missing-page descriptions consistently start with the slug, e.g.
  // "no-cloning-theorem is referenced by both quantum-error-correction…".
  // Defensive: only treat it as a slug if it's kebab-case followed by whitespace.
  const m = description.match(/^([a-z0-9-]+)\s/);
  return m?.[1] ?? null;
}

// Contradictions and similar cross-page issues have `affectedPages` with 2+
// entries (e.g. ["grovers-algorithm", "lov-grover"]). The suggested fix
// usually names the specific page to edit ("update lov-grover to 1996").
// Naively picking affectedPages[0] is wrong half the time — pick the page
// the fix instruction actually targets.
function targetPageForFix(
  affectedPages: ReadonlyArray<string>,
  suggestedFix: string | null,
): string | null {
  if (affectedPages.length === 0) return null;
  if (affectedPages.length === 1) return affectedPages[0] ?? null;
  if (!suggestedFix) return affectedPages[0] ?? null;
  // Collect every kebab-case token in the fix instruction, then keep only
  // those that are actually in affectedPages.
  const mentioned = new Set(
    (suggestedFix.match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter((t) => t.includes("-")),
  );
  const matches = affectedPages.filter((p) => mentioned.has(p));
  if (matches.length === 1) return matches[0] ?? null;
  // 2+ matches: prefer the LAST one — the LLM usually phrases the fix as
  // "X says Y but Z says W; update Z" so the target appears later.
  if (matches.length > 1) return matches[matches.length - 1] ?? null;
  return affectedPages[0] ?? null;
}

type FixedKind = "removed" | "stub-created" | "index-rebuilt" | "fix-applied" | "fix-noop";
type FixedState = {
  kind: FixedKind;
  /** The slug that was actually targeted, when relevant (e.g. for contradictions). */
  slug?: string;
  /** Free-form summary the LLM returned describing what it changed. */
  summary?: string | null;
};

export function LintView() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LintResult | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixedKeys, setFixedKeys] = useState<Map<string, FixedState>>(new Map());
  const [fixingKey, setFixingKey] = useState<string | null>(null);

  // Bulk actions (top bar)
  const [bulkBusy, setBulkBusy] = useState<null | "rebuild-index" | "fix-all-broken">(null);
  const [bulkFlash, setBulkFlash] = useState<string | null>(null);

  // Lint history — loaded on mount + re-fetched after every successful run
  // so the "Recent runs" panel reflects the just-appended log entry.
  const [history, setHistory] = useState<LintHistoryEntry[] | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/lint/history?limit=10", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { history: LintHistoryEntry[] };
      setHistory(data.history);
    } catch {
      // non-fatal — the panel just stays empty
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  async function runLint() {
    setBusy(true);
    setError(null);
    setFixedKeys(new Map());
    setBulkFlash(null);
    try {
      const res = await fetch("/api/lint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as LintSuccess | LintFailure;
      if (!res.ok || !("ok" in json) || json.ok !== true) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setResult(json.result);
      setModel(json.model);
      // The lint call just appended a new entry to log.md; refresh the
      // history panel so the user sees it without a page reload.
      void refreshHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function markFixed(
    key: string,
    kind: FixedKind,
    extra?: { slug?: string; summary?: string | null },
  ) {
    setFixedKeys((prev) => {
      const next = new Map(prev);
      next.set(key, { kind, ...extra });
      return next;
    });
  }

  async function applyRemoveBrokenLink(issue: LintIssue, key: string) {
    const brokenSlug = brokenLinkSlug(issue.description);
    const pageSlug = issue.affectedPages[0];
    if (!brokenSlug || !pageSlug) return;
    setFixingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/lint/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "remove-broken-link", pageSlug, brokenSlug }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      markFixed(key, "removed");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFixingKey(null);
    }
  }

  async function applyCreateStub(missingSlug: string, key: string) {
    setFixingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/lint/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "create-stub-page", missingSlug }),
      });
      const json = (await res.json()) as {
        kind?: "stub-created" | "index-rebuilt";
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      markFixed(key, json.kind === "index-rebuilt" ? "index-rebuilt" : "stub-created");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFixingKey(null);
    }
  }

  async function applySuggestedFix(issue: LintIssue, key: string) {
    const pageSlug = targetPageForFix(issue.affectedPages, issue.suggestedFix);
    if (!pageSlug || !issue.suggestedFix) return;
    setFixingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/lint/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "apply-suggested-fix",
          pageSlug,
          issueDescription: issue.description,
          fixInstruction: issue.suggestedFix,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        kind?: "fix-applied" | "fix-noop";
        slug?: string;
        changeSummary?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      // Stash the targeted slug + summary so the per-issue flash can show
      // which page actually got edited and what the LLM said it changed.
      markFixed(key, json.kind === "fix-noop" ? "fix-noop" : "fix-applied", {
        slug: json.slug ?? pageSlug,
        summary: json.changeSummary ?? null,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFixingKey(null);
    }
  }

  async function bulkRebuildIndex() {
    setBulkBusy("rebuild-index");
    setBulkFlash(null);
    setError(null);
    try {
      const res = await fetch("/api/lint/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "rebuild-index" }),
      });
      const json = (await res.json()) as {
        added?: string[];
        removed?: string[];
        totalPages?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const addedN = json.added?.length ?? 0;
      const removedN = json.removed?.length ?? 0;
      setBulkFlash(
        `Index rebuilt — ${json.totalPages ?? 0} pages indexed, ${addedN} added, ${removedN} orphan ${removedN === 1 ? "entry" : "entries"} removed.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkBusy(null);
    }
  }

  async function bulkFixAllBrokenLinks(items: Array<{ pageSlug: string; brokenSlug: string }>) {
    if (items.length === 0) return;
    if (
      !confirm(
        `Remove ${items.length} broken link${items.length === 1 ? "" : "s"} across the wiki? This rewrites the affected pages. (Originals are backed up to .llm-wiki/page-history/.)`,
      )
    )
      return;
    setBulkBusy("fix-all-broken");
    setBulkFlash(null);
    setError(null);
    try {
      const res = await fetch("/api/lint/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "fix-all-broken-links", items }),
      });
      const json = (await res.json()) as {
        fixed?: Array<unknown>;
        failed?: Array<{ pageSlug: string; brokenSlug: string; error: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const fixedN = json.fixed?.length ?? 0;
      const failedN = json.failed?.length ?? 0;
      setBulkFlash(
        failedN === 0
          ? `Removed ${fixedN} broken link${fixedN === 1 ? "" : "s"}.`
          : `Removed ${fixedN}; ${failedN} failed (likely already gone).`,
      );
      // Mark each fix as done locally so the per-issue buttons collapse.
      if (json.fixed && result) {
        const fixedSet = new Set(
          (json.fixed as Array<{ pageSlug: string; brokenSlug: string }>).map(
            (i) => `${i.pageSlug}|${i.brokenSlug}`,
          ),
        );
        for (let i = 0; i < result.issues.length; i++) {
          const issue = result.issues[i]!;
          if (issue.type !== "broken-link") continue;
          const slug = brokenLinkSlug(issue.description);
          const pageSlug = issue.affectedPages[0];
          if (!slug || !pageSlug) continue;
          if (fixedSet.has(`${pageSlug}|${slug}`)) {
            const key = `broken-link-${i}-${issue.affectedPages.join(",")}`;
            markFixed(key, "removed");
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkBusy(null);
    }
  }

  const grouped = result
    ? TYPE_ORDER.map((t) => ({
        type: t,
        items: result.issues.filter((i) => i.type === t),
      })).filter((g) => g.items.length > 0)
    : null;

  const counts = result
    ? {
        high: result.issues.filter((i) => i.severity === "high").length,
        medium: result.issues.filter((i) => i.severity === "medium").length,
        low: result.issues.filter((i) => i.severity === "low").length,
      }
    : null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Wiki health check"
        title="Lint"
        description="A fast local scan for broken links and orphans, plus an LLM pass for contradictions, gaps, stale claims, and missing pages."
        actions={
          <>
            <Button onClick={runLint} disabled={busy}>
              {busy ? "Linting…" : result ? "Re-run lint" : "Run lint"}
            </Button>
            {model ? (
              <span className="text-caption text-muted-foreground">via {model}</span>
            ) : null}
          </>
        }
      />

      {error ? (
        <div className="mt-6 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Always-visible "Recent runs" panel — pulled from log.md so the
          trend is readable before re-running. Loads on mount, refreshes
          after every successful lint. */}
      {history !== null ? (
        <section className="mt-6 rounded-md border border-border/70 bg-card p-4">
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            Recent runs
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No lint runs yet. Click <strong>Run lint</strong> to record the first one — the
              count + health rating gets appended to <code className="font-mono">log.md</code>{" "}
              so you can track wiki health over time.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {history.map((h, i) => {
                const prevCount = history[i + 1]?.totalIssues;
                const delta =
                  prevCount === undefined ? null : h.totalIssues - prevCount;
                return (
                  <li
                    key={`${h.stamp}-${i}`}
                    className="flex flex-wrap items-baseline gap-2 text-muted-foreground"
                  >
                    <span className="font-mono text-[11px]">{h.stamp}</span>
                    <span className="text-foreground">
                      {h.totalIssues} issue{h.totalIssues === 1 ? "" : "s"}
                    </span>
                    {h.health ? (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0 text-[10px] uppercase tracking-wider",
                          HEALTH_STYLES[h.health],
                        )}
                      >
                        {h.health}
                      </span>
                    ) : null}
                    {delta !== null && delta !== 0 ? (
                      <span
                        className={
                          "text-[11px] " +
                          (delta < 0
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-700 dark:text-amber-300")
                        }
                      >
                        {delta < 0 ? "−" : "+"}
                        {Math.abs(delta)} vs previous
                      </span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground/70">
                      ({relativeFromLogStamp(h.stamp)})
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            <Link
              href="/log"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              View full timeline →
            </Link>
            <span className="ml-2">
              (ingests, edits, lint, schema saves — everything that touched the wiki)
            </span>
          </div>
        </section>
      ) : null}

      {result && counts ? (
        <section className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
                HEALTH_STYLES[result.overallHealth],
              )}
            >
              {result.overallHealth}
            </span>
            <span className="text-sm text-muted-foreground">
              {result.issues.length} issue{result.issues.length === 1 ? "" : "s"} across{" "}
              {result.totalPages} page{result.totalPages === 1 ? "" : "s"} ·{" "}
              {counts.high} high · {counts.medium} medium · {counts.low} low
            </span>
            {result.truncated ? (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                Truncated to most-relevant pages for the LLM
              </span>
            ) : null}
          </div>

          {/* Delta vs last lint run — quick "is the wiki getting better?"
              signal. Pulled from the previous "## [..] lint" line in log.md. */}
          {result.previousRun ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Previous run {relativeFromLogStamp(result.previousRun.stamp)}:{" "}
                <span className="text-foreground">
                  {result.previousRun.totalIssues} issue
                  {result.previousRun.totalIssues === 1 ? "" : "s"}
                </span>
              </span>
              {(() => {
                const delta = result.issues.length - result.previousRun.totalIssues;
                if (delta === 0) return <span>· no change</span>;
                const better = delta < 0;
                return (
                  <span
                    className={
                      better
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    · {better ? "−" : "+"}
                    {Math.abs(delta)} {better ? "fewer" : "more"} now
                  </span>
                );
              })()}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              First lint run on this wiki. Future runs will compare against this baseline.
            </p>
          )}

          {/* Bulk actions: cheap, broadly-applicable fixes. Rebuild index is
              always safe (local, no LLM). Fix-all-broken-links shows a count
              and confirms before mass-rewriting pages. */}
          {(() => {
            const localBrokenItems = result.issues
              .filter((i) => i.type === "broken-link" && i.source === "local")
              .map((i) => {
                const slug = brokenLinkSlug(i.description);
                const pageSlug = i.affectedPages[0];
                return slug && pageSlug ? { pageSlug, brokenSlug: slug } : null;
              })
              .filter((x): x is { pageSlug: string; brokenSlug: string } => x !== null);
            const showBulk = localBrokenItems.length > 0;
            return (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/30 p-3">
                <span className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  Bulk fixes
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkRebuildIndex}
                  disabled={bulkBusy !== null}
                  title="Rewrites index.md from the page files on disk. Free, no LLM call."
                >
                  {bulkBusy === "rebuild-index" ? "Rebuilding…" : "Rebuild index"}
                </Button>
                {showBulk ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkFixAllBrokenLinks(localBrokenItems)}
                    disabled={bulkBusy !== null}
                    title="Removes every [[broken-slug]] reference from its host page."
                  >
                    {bulkBusy === "fix-all-broken"
                      ? "Fixing…"
                      : `Remove all broken links (${localBrokenItems.length})`}
                  </Button>
                ) : null}
                {bulkFlash ? (
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    {bulkFlash}
                  </span>
                ) : null}
              </div>
            );
          })()}

          {grouped && grouped.length > 0 ? (
            <div className="space-y-6">
              {grouped.map(({ type, items }) => (
                <div key={type}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {type} ({items.length})
                  </h3>
                  <ul className="space-y-2">
                    {items.map((issue, i) => {
                      const key = `${type}-${i}-${issue.affectedPages.join(",")}`;
                      const fixedState = fixedKeys.get(key);
                      const isBrokenLink = issue.type === "broken-link";
                      const brokenSlug = isBrokenLink ? brokenLinkSlug(issue.description) : null;
                      const hasRemoveTarget = isBrokenLink && brokenSlug && issue.affectedPages[0];
                      const isMissingPage = issue.type === "missing-page";
                      const targetSlug = isMissingPage
                        ? missingPageSlug(issue.description)
                        : brokenSlug;
                      const canCreateStub = (isBrokenLink || isMissingPage) && targetSlug !== null;
                      const canApplySuggested =
                        !isBrokenLink &&
                        !isMissingPage &&
                        issue.suggestedFix !== null &&
                        issue.suggestedFix !== undefined &&
                        issue.affectedPages.length > 0;
                      return (
                        <li
                          key={key}
                          className="rounded-md border border-border bg-background p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                                SEVERITY_STYLES[issue.severity],
                              )}
                            >
                              {issue.severity}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {issue.source}
                            </span>
                            {issue.affectedPages.length > 0 ? (
                              <span className="text-xs text-muted-foreground">
                                on{" "}
                                {issue.affectedPages.map((p, idx) => (
                                  <span key={p}>
                                    <Link
                                      href={`/wiki/${p}`}
                                      className="underline underline-offset-2"
                                    >
                                      {p}
                                    </Link>
                                    {idx < issue.affectedPages.length - 1 ? ", " : ""}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2">{issue.description}</p>
                          {issue.suggestedFix ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Suggested fix: {issue.suggestedFix}
                            </p>
                          ) : null}

                          {fixedState ? (
                            <p
                              className={cn(
                                "mt-2 text-xs",
                                fixedState.kind === "fix-noop"
                                  ? "text-amber-700 dark:text-amber-300"
                                  : "text-emerald-700 dark:text-emerald-300",
                              )}
                            >
                              {fixedState.kind === "removed" ? "Removed from page." : null}
                              {fixedState.kind === "stub-created"
                                ? `Stub page created at /wiki/${targetSlug}.`
                                : null}
                              {fixedState.kind === "index-rebuilt"
                                ? "Page already existed — index rebuilt to include it."
                                : null}
                              {fixedState.kind === "fix-applied" ? (
                                <>
                                  Applied to{" "}
                                  <Link
                                    href={`/wiki/${fixedState.slug ?? issue.affectedPages[0]}`}
                                    className="underline underline-offset-2"
                                  >
                                    {fixedState.slug ?? issue.affectedPages[0]}
                                  </Link>
                                  {fixedState.summary ? ` — ${fixedState.summary}` : "."}
                                </>
                              ) : null}
                              {fixedState.kind === "fix-noop" ? (
                                <>
                                  LLM made no change to{" "}
                                  <Link
                                    href={`/wiki/${fixedState.slug ?? issue.affectedPages[0]}`}
                                    className="underline underline-offset-2"
                                  >
                                    {fixedState.slug ?? issue.affectedPages[0]}
                                  </Link>
                                  {fixedState.summary ? ` — ${fixedState.summary}` : "."} Try
                                  editing the page manually, or re-run lint after fixing other
                                  issues first.
                                </>
                              ) : null}
                            </p>
                          ) : (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {hasRemoveTarget ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => applyRemoveBrokenLink(issue, key)}
                                  disabled={fixingKey !== null || bulkBusy !== null}
                                >
                                  {fixingKey === key ? "Removing…" : "Remove broken link"}
                                </Button>
                              ) : null}
                              {canCreateStub && targetSlug ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => applyCreateStub(targetSlug, key)}
                                  disabled={fixingKey !== null || bulkBusy !== null}
                                  title="Drafts a small starter page using the ingest model and context from referencing pages."
                                >
                                  {fixingKey === key
                                    ? "Drafting…"
                                    : isBrokenLink
                                      ? "Create page"
                                      : "Create stub"}
                                </Button>
                              ) : null}
                              {canApplySuggested ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => applySuggestedFix(issue, key)}
                                  disabled={fixingKey !== null || bulkBusy !== null}
                                  title="Sends the page + the fix instruction to the lint model and writes the result back."
                                >
                                  {fixingKey === key ? "Applying…" : "Apply suggested fix"}
                                </Button>
                              ) : null}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No issues found. Nice.
            </p>
          )}

          {result.suggestedQuestions.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Suggested follow-up questions
              </h3>
              <ul className="space-y-1.5 text-sm">
                {result.suggestedQuestions.map((q, i) => (
                  <li key={i}>
                    <Link
                      href={`/query?q=${encodeURIComponent(q)}`}
                      className="text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      {q}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </PageContainer>
  );
}
