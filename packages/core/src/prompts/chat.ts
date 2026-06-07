import type { ExistingPageSnippet } from "./ingest";
import { DEFAULT_OUTPUT_LANGUAGE } from "../config";
import { humanTextInstruction } from "./language";

function buildSystemRules(outputLanguage: string): string {
  return `You are answering questions in a persistent chat thread against a personal LLM Wiki.

Rules:
- Cite wiki pages with [[slug]] (use the slugs from the index — kebab-case, lowercase).
- Reference earlier turns in the thread when relevant.
- If the wiki doesn't cover something, say so honestly — don't invent.
- Use markdown freely (lists, headings, tables). No JSON output unless explicitly asked.
- Be concise but complete. Prioritize the user's question over restating context.
- ${humanTextInstruction(outputLanguage)} Keep slugs exactly as required; everything else should be ${outputLanguage} even if the thread or source pages are in another language.`;
}

export type BuildChatSystemPromptOpts = {
  schema: string;
  index: string;
  outputLanguage: string;
  relevantPages: ExistingPageSnippet[];
};

export function buildChatSystemPrompt(opts: BuildChatSystemPromptOpts): string {
  const outputLanguage = opts.outputLanguage.trim() || DEFAULT_OUTPUT_LANGUAGE;
  const pagesBlock =
    opts.relevantPages.length > 0
      ? opts.relevantPages
          .map(
            (p) =>
              `### ${p.title} (slug: ${p.slug}, type: ${p.type})\n${truncateToWords(p.excerpt, 800)}`,
          )
          .join("\n\n---\n\n")
      : "(no pages currently match — the wiki may not cover this thread's topic yet)";

  return [
    buildSystemRules(outputLanguage),
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
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}\n\n[truncated: ${words.length - maxWords} more words]`;
}

function fenceMarkdown(text: string): string {
  return `\`\`\`\`markdown\n${text}\n\`\`\`\``;
}
