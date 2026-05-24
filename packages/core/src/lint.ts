import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { callLLM, type LlmClient } from "@llm-wiki/llm";

import type { Db } from "./db";
import { listPageRows } from "./db-pages";
import { insertUsage } from "./db-usage";
import { extractWikiLinks } from "./links";
import { buildLintPrompt, type DeterministicFinding } from "./prompts/lint";
import type { ExistingPageSnippet } from "./prompts/ingest";
import { LintResponseSchema, type LintResponse } from "./schema";
import { appendLog, readIndex, readPage, readSchema, WIKI_PATHS } from "./wiki";

// Cap how many pages we send to the LLM. With ~800 words per snippet, 60
// pages fits comfortably inside a 200K-context model. Larger wikis fall
// back to most-recently-updated pages and a warning in the response.
const MAX_PAGES_TO_LLM = 60;

export type LintProgressEvent =
  | { phase: "local"; message: string }
  | { phase: "llm"; message: string }
  | { phase: "done" };

export type LintWikiOptions = {
  wikiPath: string;
  db: Db;
  client: LlmClient;
  model: string;
  onProgress?: (event: LintProgressEvent) => void;
};

export type LintResultIssue = LintResponse["issues"][number] & {
  /** Source of the issue. "local" issues are 100% deterministic; "llm" are the model's semantic findings. */
  source: "local" | "llm";
};

/** Summary of the most-recent previous lint run, parsed from log.md. */
export type PreviousLintSummary = {
  /** Timestamp from the log heading, e.g. "2026-05-24 02:30". */
  stamp: string;
  totalIssues: number;
  health: LintResponse["overallHealth"] | null;
};

export type LintResult = Omit<LintResponse, "issues"> & {
  issues: LintResultIssue[];
  truncated: boolean;
  totalPages: number;
  /** The lint run immediately before this one, if any. Powers the "X → Y issues" delta in the UI. */
  previousRun: PreviousLintSummary | null;
};

/**
 * Combines deterministic local checks (broken links, orphans) with an LLM
 * pass (contradictions, gaps, stale, missing-page).
 */
export async function lintWiki(opts: LintWikiOptions): Promise<LintResult> {
  opts.onProgress?.({ phase: "local", message: "Scanning for broken links and orphans..." });

  // Capture the previous run BEFORE we append this one so the delta isn't
  // self-referential.
  const previousRun = await getLastLintSummary(opts.wikiPath);

  const allRows = listPageRows(opts.db);
  const allSlugs = new Set(allRows.map((r) => r.slug));
  const inboundCount = new Map<string, number>();
  for (const slug of allSlugs) inboundCount.set(slug, 0);

  const snippets: ExistingPageSnippet[] = [];
  const localIssues: LintResultIssue[] = [];

  for (const row of allRows) {
    let page;
    try {
      page = await readPage(opts.wikiPath, row.slug);
    } catch {
      continue;
    }
    snippets.push({
      slug: page.slug,
      title: page.frontmatter.title,
      type: page.frontmatter.type,
      excerpt: page.content,
    });

    const refs = extractWikiLinks(page.content);
    const seen = new Set<string>();
    for (const ref of refs) {
      // Bump inbound counter for known target slugs (deduped per page so
      // multiple refs from one page don't inflate the count).
      if (allSlugs.has(ref.slug) && !seen.has(ref.slug)) {
        inboundCount.set(ref.slug, (inboundCount.get(ref.slug) ?? 0) + 1);
        seen.add(ref.slug);
      }
      // Broken-link issue: link target doesn't exist on disk.
      if (!allSlugs.has(ref.slug)) {
        localIssues.push({
          severity: "high",
          type: "broken-link",
          description: `${page.frontmatter.title} links to [[${ref.slug}]], which doesn't exist`,
          affectedPages: [page.slug],
          suggestedFix: `Remove the [[${ref.slug}]] reference or create the page.`,
          source: "local",
        });
      }
    }
  }

  // Orphans: pages with zero inbound references. Skip overview pages because
  // those are meant to be entry points, not link targets.
  for (const row of allRows) {
    if (row.type === "overview") continue;
    if ((inboundCount.get(row.slug) ?? 0) === 0) {
      localIssues.push({
        severity: "low",
        type: "orphan",
        description: `${row.title} has no inbound references from other pages`,
        affectedPages: [row.slug],
        suggestedFix: `Link to [[${row.slug}]] from a related page, or delete the page if it's no longer needed.`,
        source: "local",
      });
    }
  }

  // ---- LLM pass --------------------------------------------------------

  const truncated = snippets.length > MAX_PAGES_TO_LLM;
  const pagesForLlm = truncated
    ? [...snippets]
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .slice(0, MAX_PAGES_TO_LLM)
    : snippets;

  // Hand the deterministic findings to the LLM so it doesn't duplicate them.
  const deterministicFindings: DeterministicFinding[] = localIssues.map((i) => ({
    type: i.type as "broken-link" | "orphan",
    page: i.affectedPages[0] ?? "",
    detail: i.description,
  }));

  let llmIssues: LintResultIssue[] = [];
  let suggestedQuestions: string[] = [];
  let overallHealth: LintResponse["overallHealth"] = "excellent";

  if (snippets.length === 0) {
    // Empty wiki — short-circuit. No issues, no LLM call, no usage cost.
    overallHealth = "excellent";
  } else {
    opts.onProgress?.({
      phase: "llm",
      message: `Calling ${opts.model} with ${pagesForLlm.length}${truncated ? `/${snippets.length}` : ""} pages…`,
    });

    const [schema, index] = await Promise.all([
      readSchemaOrDefault(opts.wikiPath),
      readIndexOrDefault(opts.wikiPath),
    ]);
    const prompt = buildLintPrompt({
      schema,
      index,
      pages: pagesForLlm,
      deterministicFindings,
    });

    const result = await callLLM({
      client: opts.client,
      model: opts.model,
      system: prompt.system,
      user: prompt.user,
      schema: LintResponseSchema,
    });

    insertUsage(opts.db, {
      operation: "lint",
      model: result.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cost_cents: null,
      created_at: new Date().toISOString(),
    });

    llmIssues = result.data.issues.map((i) => ({ ...i, source: "llm" as const }));
    suggestedQuestions = result.data.suggestedQuestions;
    overallHealth = result.data.overallHealth;
  }

  const issues = [...localIssues, ...llmIssues];
  const counts = {
    high: issues.filter((i) => i.severity === "high").length,
    medium: issues.filter((i) => i.severity === "medium").length,
    low: issues.filter((i) => i.severity === "low").length,
  };

  // Append a one-line summary to log.md so the user has a timeline of
  // wiki-health checks alongside ingest/edit events. Format matches the
  // pattern in docs/03 and the existing ingest log entries.
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const head = `## [${stamp}] lint | ${issues.length} issue${issues.length === 1 ? "" : "s"} — ${overallHealth}`;
  const detail = `- ${counts.high} high, ${counts.medium} medium, ${counts.low} low across ${snippets.length} page${snippets.length === 1 ? "" : "s"}`;
  await appendLog(opts.wikiPath, `${head}\n${detail}`);

  opts.onProgress?.({ phase: "done" });

  return {
    issues,
    suggestedQuestions,
    overallHealth,
    truncated,
    totalPages: snippets.length,
    previousRun,
  };
}

/**
 * Reads log.md and returns the most recent lint summary, parsed from a
 * heading line like `## [YYYY-MM-DD HH:MM] lint | N issues — health`.
 * Returns null if log.md doesn't exist or has no lint entries yet.
 *
 * Exported so an upcoming "lint history" view (if it ever ships) can show
 * a longer timeline; today only lintWiki itself calls it.
 */
export async function getLastLintSummary(
  wikiPath: string,
): Promise<PreviousLintSummary | null> {
  const logPath = join(wikiPath, WIKI_PATHS.log);
  let text: string;
  try {
    text = await readFile(logPath, "utf8");
  } catch {
    return null;
  }
  // Walk lines from the end backwards — most recent entry wins.
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    const m = line.match(
      /^## \[(.+?)\] lint \| (\d+) issues?\s*(?:—\s*([a-z-]+))?\s*$/i,
    );
    if (m) {
      return {
        stamp: m[1] ?? "",
        totalIssues: parseInt(m[2] ?? "0", 10),
        health: parseHealth(m[3]),
      };
    }
  }
  return null;
}

function parseHealth(s: string | undefined): LintResponse["overallHealth"] | null {
  if (!s) return null;
  if (s === "excellent" || s === "good" || s === "fair" || s === "needs-work") return s;
  return null;
}

// ---- internals -----------------------------------------------------------

async function readSchemaOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readSchema(wikiPath);
  } catch {
    return "(no schema set yet)";
  }
}

async function readIndexOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readIndex(wikiPath);
  } catch {
    return "(no index yet)";
  }
}
