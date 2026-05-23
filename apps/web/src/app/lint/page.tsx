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

export default function LintPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LintResult | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixedKeys, setFixedKeys] = useState<Set<string>>(new Set());
  const [fixingKey, setFixingKey] = useState<string | null>(null);

  async function runLint() {
    setBusy(true);
    setError(null);
    setFixedKeys(new Set());
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

  async function applyFix(issue: LintIssue, key: string) {
    const brokenSlug = brokenLinkSlug(issue.description);
    const pageSlug = issue.affectedPages[0];
    if (!brokenSlug || !pageSlug) return;
    setFixingKey(key);
    try {
      const res = await fetch("/api/lint/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "remove-broken-link", pageSlug, brokenSlug }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setFixedKeys((prev) => new Set([...prev, key]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFixingKey(null);
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
                      const isLocalBroken = issue.type === "broken-link" && issue.source === "local";
                      const fixed = fixedKeys.has(key);
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
                          {isLocalBroken ? (
                            <div className="mt-2">
                              {fixed ? (
                                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                                  Removed from page.
                                </span>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => applyFix(issue, key)}
                                  disabled={fixingKey !== null}
                                >
                                  {fixingKey === key ? "Removing…" : "Remove broken link"}
                                </Button>
                              )}
                            </div>
                          ) : null}
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
