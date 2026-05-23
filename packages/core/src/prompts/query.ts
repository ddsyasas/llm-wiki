import type { ExistingPageSnippet } from "./ingest";

// Per docs/05 query prompt. We reuse the ExistingPageSnippet shape from the
// ingest prompt so the page list rendering stays consistent across operations.

const SYSTEM_RULES = `You answer questions against an LLM Wiki.

Process:
1. Read the index to find pages potentially relevant to the question.
2. Read those pages.
3. Synthesize a concise answer with [[slug]] citations pointing at the pages you actually used.
4. If you can't answer from the wiki, say so honestly — better to admit a gap than invent.
5. If the answer reveals a clearly useful new wiki page (one that doesn't exist yet but should), put it in suggestedNewPage; otherwise leave it null.

Output rules:
- pagesUsed: list every slug you actually cited in the answer. Must match existing pages from the index.
- suggestedNewPage: null OR an object {slug (new, kebab-case), title, content (markdown body), reason (why it should exist)}.
- confidence: "high" if the wiki directly answers, "medium" if you had to infer, "low" if you're guessing.
- caveats: optional notes about limitations, contradictions, or things the wiki doesn't cover.
- answer: markdown is fine. Use [[slug]] for any wiki cross-link.

Output ONLY a valid JSON object matching the schema. No prose, no markdown fences.`;

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
