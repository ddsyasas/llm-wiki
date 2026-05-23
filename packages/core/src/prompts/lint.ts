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
(contradictions, stale claims, missing-page suggestions, gaps).`;

const JSON_SHAPE = `Output ONLY a valid JSON object matching this exact shape. No prose, no markdown fences:

{
  "issues": [
    {
      "severity": "high",
      "type": "contradiction",
      "description": "What disagrees, and where.",
      "affectedPages": ["slug-a", "slug-b"],
      "suggestedFix": "One-line action the user could take, or null."
    }
  ],
  "suggestedQuestions": ["Up to 5 follow-up questions the user could investigate."],
  "overallHealth": "good"
}

Strict field rules:
- "severity" MUST be one of: "high", "medium", "low".
- "type" MUST be one of: "contradiction", "orphan", "missing-page", "broken-link", "gap", "stale".
- "overallHealth" MUST be one of: "excellent", "good", "fair", "needs-work".
- "affectedPages" MUST be an array of kebab-case slugs (use [] if none). Every slug must exist in the index above.
- "suggestedFix" MUST be a string or null.
- "issues" and "suggestedQuestions" MUST be arrays. Use [] when empty.

Severity guidance:
- "high" for contradictions and broken cross-references.
- "medium" for gaps and missing-page suggestions.
- "low" for orphans and stale claims.

Overall health rubric:
- "excellent" — zero issues.
- "good" — only low-severity issues.
- "fair" — some medium-severity issues.
- "needs-work" — any high-severity issues.`;

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
    "",
    JSON_SHAPE,
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
