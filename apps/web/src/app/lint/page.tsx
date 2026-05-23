"use client";

import Link from "next/link";
import { useState } from "react";

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
};

type LintSuccess = { ok: true; model: string; result: LintResult };
type LintFailure = { ok?: false; error: string; type?: string };

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

function missingPageSlug(description: string): string | null {
  // LLM missing-page descriptions consistently start with the slug, e.g.
  // "no-cloning-theorem is referenced by both quantum-error-correction…".
  // Defensive: only treat it as a slug if it's kebab-case followed by whitespace.
  const m = description.match(/^([a-z0-9-]+)\s/);
  return m?.[1] ?? null;
}

type FixedState = "removed" | "stub-created" | "index-rebuilt" | "fix-applied";

export default function LintPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LintResult | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixedKeys, setFixedKeys] = useState<Map<string, FixedState>>(new Map());
  const [fixingKey, setFixingKey] = useState<string | null>(null);

  // Bulk actions (top bar)
  const [bulkBusy, setBulkBusy] = useState<null | "rebuild-index" | "fix-all-broken">(null);
  const [bulkFlash, setBulkFlash] = useState<string | null>(null);

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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function markFixed(key: string, state: FixedState) {
    setFixedKeys((prev) => {
      const next = new Map(prev);
      next.set(key, state);
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
    const pageSlug = issue.affectedPages[0];
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
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      markFixed(key, "fix-applied");
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
                            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                              {fixedState === "removed" ? "Removed from page." : null}
                              {fixedState === "stub-created"
                                ? `Stub page created at /wiki/${targetSlug}.`
                                : null}
                              {fixedState === "index-rebuilt"
                                ? "Page already existed — index rebuilt to include it."
                                : null}
                              {fixedState === "fix-applied"
                                ? "Suggested fix applied to the page."
                                : null}
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
