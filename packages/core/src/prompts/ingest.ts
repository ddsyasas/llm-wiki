import type { Page } from "../types";

// Per docs/05. Kept as a function rather than a static string so per-wiki
// context (schema, index, top-K pages) interpolates predictably.

const SYSTEM_RULES = `You maintain an LLM Wiki following Andrej Karpathy's pattern. Read the new source and produce structured updates.

Rules:
- Slugs are kebab-case, lowercase, hyphens only, no special chars.
- Cross-link liberally with [[slug]] or [[slug|Display Name]].
- One entity or concept per page. Keep pages focused.
- Update existing pages rather than duplicating info.
- If new info contradicts an existing page, flag it in the contradictions array.
- Be concise. This is a personal wiki, not Wikipedia.
- Page type guidance:
  - entity: a person, organization, product, place
  - concept: an idea, technique, framework, theorem
  - source: a single-document summary (use sparingly, only for important sources)
  - comparison: two or more entities/concepts contrasted
  - overview: high-level synthesis
- Every newPages entry must include slug, title, type, content (markdown), and tags.
- Every pageUpdates entry must include slug (matching an existing page), content (full new body), and updateReason.
- Every indexEntries entry must list the page's category and a one-line summary (<= 120 chars).
- logEntry is a single-line summary of what you did, prefixed with the source title.
- Output ONLY a valid JSON object matching the schema. No prose, no markdown fences.`;

export type ExistingPageSnippet = {
  slug: string;
  title: string;
  type: Page["frontmatter"]["type"];
  excerpt: string;
};

export type BuildIngestPromptOpts = {
  schema: string;
  index: string;
  relevantPages: ExistingPageSnippet[];
  source: {
    title: string;
    format: string;
    content: string;
  };
};

export function buildIngestPrompt(opts: BuildIngestPromptOpts): {
  system: string;
  user: string;
} {
  const pagesBlock =
    opts.relevantPages.length > 0
      ? opts.relevantPages
          .map(
            (p) =>
              `### ${p.title} (slug: ${p.slug}, type: ${p.type})\n${truncateToWords(p.excerpt, 1000)}`,
          )
          .join("\n\n---\n\n")
      : "(no existing pages yet — this wiki is empty)";

  const system = [
    SYSTEM_RULES,
    "",
    "User schema (CLAUDE.md):",
    fenceMarkdown(opts.schema),
    "",
    "Current wiki index:",
    fenceMarkdown(opts.index),
    "",
    `Existing pages (top ${opts.relevantPages.length} most relevant):`,
    fenceMarkdown(pagesBlock),
  ].join("\n");

  const user = [
    `New source: "${opts.source.title}" (format: ${opts.source.format})`,
    "",
    "--- BEGIN SOURCE ---",
    opts.source.content,
    "--- END SOURCE ---",
  ].join("\n");

  return { system, user };
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}\n\n[truncated: ${words.length - maxWords} more words]`;
}

// Markdown blocks inside the prompt get fenced so the LLM never confuses them
// with its own output structure. Pick a long fence so embedded triple-backticks
// in the user's schema or pages don't terminate it early.
function fenceMarkdown(text: string): string {
  return `\`\`\`\`markdown\n${text}\n\`\`\`\``;
}
