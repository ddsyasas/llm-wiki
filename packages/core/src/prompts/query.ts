import type { ExistingPageSnippet } from "./ingest";

// Per docs/05 query prompt. We reuse the ExistingPageSnippet shape from the
// ingest prompt so the page list rendering stays consistent across operations.

const SYSTEM_RULES = `You answer questions against an LLM Wiki.

Process:
1. Read the index to find pages potentially relevant to the question.
2. Read those pages.
3. Synthesize a concise answer with [[slug]] citations pointing at the pages you actually used.
4. If you can't answer from the wiki, say so honestly — better to admit a gap than invent.
5. If the answer reveals a clearly useful new wiki page (one that doesn't exist yet but should), put it in suggestedNewPage; otherwise leave it null.`;

const JSON_SHAPE = `Output ONLY a valid JSON object matching this exact shape. No prose, no markdown fences:

{
  "answer": "Markdown body of the answer. Use [[slug]] for citations.",
  "pagesUsed": ["page-slug-1", "page-slug-2"],
  "suggestedNewPage": null,
  "confidence": "high",
  "caveats": ["Optional notes about limitations or things the wiki doesn't cover."]
}

OR if you'd suggest a new page:

{
  "answer": "...",
  "pagesUsed": [...],
  "suggestedNewPage": {
    "slug": "new-page-slug",
    "title": "Display Title",
    "content": "Markdown body for the page.",
    "reason": "Why this page should exist."
  },
  "confidence": "medium",
  "caveats": []
}

Strict field rules:
- "confidence" MUST be one of: "high", "medium", "low".
- "pagesUsed" MUST be an array of slugs (kebab-case, [a-z0-9-]+). Every slug must exist in the index above. Use [] if none.
- "caveats" MUST be an array of strings. Use [] if none.
- "suggestedNewPage" MUST be null or an object — never an array, never omitted.
- "answer" is a required string.`;

export type BuildQueryPromptOpts = {
  schema: string;
  index: string;
  relevantPages: ExistingPageSnippet[];
  question: string;
};

export function buildQueryPrompt(opts: BuildQueryPromptOpts): { system: string; user: string } {
  const pagesBlock =
    opts.relevantPages.length > 0
      ? opts.relevantPages
          .map(
            (p) =>
              `### ${p.title} (slug: ${p.slug}, type: ${p.type})\n${truncateToWords(p.excerpt, 1000)}`,
          )
          .join("\n\n---\n\n")
      : "(no pages currently match this question — the wiki may not cover this topic yet)";

  const system = [
    SYSTEM_RULES,
    "",
    "User schema (CLAUDE.md):",
    fenceMarkdown(opts.schema),
    "",
    "Current wiki index:",
    fenceMarkdown(opts.index),
    "",
    `Possibly relevant pages (top ${opts.relevantPages.length}):`,
    fenceMarkdown(pagesBlock),
    "",
    JSON_SHAPE,
  ].join("\n");

  const user = `User question:\n\n${opts.question.trim()}`;

  return { system, user };
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}\n\n[truncated: ${words.length - maxWords} more words]`;
}

function fenceMarkdown(text: string): string {
  return `\`\`\`\`markdown\n${text}\n\`\`\`\``;
}
