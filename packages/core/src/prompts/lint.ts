import type { ExistingPageSnippet } from "./ingest";

const SYSTEM_RULES = `You health-check an LLM Wiki.

Look for:
- Contradictions between pages (two pages disagreeing on the same fact)
- Stale claims (claims that newer-dated sources would supersede)
- Orphan pages (no inbound [[slug]] references from any other page)
- Important concepts mentioned in passing but lacking their own page (missing-page)
- Broken cross-references ([[slug]] pointing to a slug that doesn't exist)
- Data gaps the wiki should fill given its topic

For each issue, suggest a fix when possible (a one-line description of what to change).
Also suggest follow-up questions the user could investigate to fill gaps.

The user has already run a deterministic local scan; treat the "deterministic findings" below
as ground truth and focus your output on semantic issues the local scan can't see
(contradictions, stale claims, missing-page suggestions, gaps).

Output rules:
- severity: "high" for contradictions and broken cross-references; "medium" for gaps and missing-page; "low" for orphans and stale.
- type: one of contradiction, orphan, missing-page, broken-link, gap, stale.
- affectedPages: every page slug the issue touches. Must be slugs from the index.
- suggestedFix: a one-line action the user could take, or null if there isn't a clean fix.
- overallHealth: "excellent" (zero issues), "good" (only low-severity), "fair" (some medium), "needs-work" (any high).
- suggestedQuestions: up to 5 specific follow-up questions the user could investigate.

Output ONLY a valid JSON object matching the schema. No prose, no markdown fences.`;

export type DeterministicFinding = {
  type: "broken-link" | "orphan";
  page: string;
  detail: string;
};

export type BuildLintPromptOpts = {
  schema: string;
  index: string;
  pages: ExistingPageSnippet[];
  deterministicFindings: DeterministicFinding[];
};

export function buildLintPrompt(opts: BuildLintPromptOpts): { system: string; user: string } {
  const pagesBlock =
    opts.pages.length > 0
      ? opts.pages
          .map(
            (p) =>
              `### ${p.title} (slug: ${p.slug}, type: ${p.type})\n${truncateToWords(p.excerpt, 800)}`,
          )
          .join("\n\n---\n\n")
      : "(wiki is empty)";

  const findingsBlock =
    opts.deterministicFindings.length === 0
      ? "(none — the wiki has no broken links and every page has at least one inbound reference)"
      : opts.deterministicFindings
          .map((f) => `- ${f.type} on ${f.page}: ${f.detail}`)
          .join("\n");

  const system = [
    SYSTEM_RULES,
    "",
    "User schema (CLAUDE.md):",
    fenceMarkdown(opts.schema),
    "",
    "Current wiki index:",
    fenceMarkdown(opts.index),
    "",
    "Deterministic findings (already detected; you do not need to repeat these):",
    fenceMarkdown(findingsBlock),
  ].join("\n");

  const user = [
    `All pages in the wiki (${opts.pages.length}):`,
    "",
    pagesBlock,
  ].join("\n");

  return { system, user };
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}\n\n[truncated]`;
}

function fenceMarkdown(text: string): string {
  return `\`\`\`\`markdown\n${text}\n\`\`\`\``;
}
