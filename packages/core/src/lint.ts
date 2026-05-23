import { callLLM, type LlmClient } from "@llm-wiki/llm";

import type { Db } from "./db";
import { listPageRows } from "./db-pages";
import { insertUsage } from "./db-usage";
import { extractWikiLinks } from "./links";
import { buildLintPrompt, type DeterministicFinding } from "./prompts/lint";
import type { ExistingPageSnippet } from "./prompts/ingest";
import { LintResponseSchema, type LintResponse } from "./schema";
import { readIndex, readPage, readSchema } from "./wiki";

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

export type LintResult = Omit<LintResponse, "issues"> & {
  issues: LintResultIssue[];
  truncated: boolean;
  totalPages: number;
};

/**
 * Combines deterministic local checks (broken links, orphans) with an LLM
 * pass (contradictions, gaps, stale, missing-page).
 */
export async function lintWiki(opts: LintWikiOptions): Promise<LintResult> {
  opts.onProgress?.({ phase: "local", message: "Scanning for broken links and orphans..." });

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

  opts.onProgress?.({ phase: "done" });

  return {
    issues: [...localIssues, ...llmIssues],
    suggestedQuestions,
    overallHealth,
    truncated,
    totalPages: snippets.length,
  };
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
