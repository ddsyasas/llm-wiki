import type { Page } from "../types";
import { DEFAULT_OUTPUT_LANGUAGE } from "../config";
import { humanTextInstruction } from "./language";

// Per docs/05. Kept as a function rather than a static string so per-wiki
// context (schema, index, top-K pages) interpolates predictably.

function buildSystemRules(outputLanguage: string): string {
  return `You maintain an LLM Wiki following Andrej Karpathy's pattern. Read the new source and produce structured updates as a single JSON object.

Behavior rules:
- Slugs are kebab-case, lowercase, hyphens only, no special chars.
- Cross-link liberally with [[slug]] or [[slug|Display Name]].
- One entity or concept per page. Keep pages focused.
- Update existing pages rather than duplicating info.
- If new info contradicts an existing page, flag it in the contradictions array.
- Be concise. This is a personal wiki, not Wikipedia.
- ${humanTextInstruction(outputLanguage)}
- Page type guidance:
  - entity: a person, organization, product, place
  - concept: an idea, technique, framework, theorem
  - source: a single-document summary (use sparingly, only for important sources)
  - comparison: two or more entities/concepts contrasted
  - overview: high-level synthesis`;
}

// An explicit shape example. This is the most reliable way to get smaller
// models (Haiku, GPT-4o-mini) to produce JSON that matches the zod schema.
// Without this example, weaker models tend to invent their own field names
// or repurpose `category` for the wiki topic.
function buildJsonShape(outputLanguage: string): string {
  return `Output ONLY a valid JSON object matching this exact shape. No prose, no markdown fences:

{
  "summary": "Short, single-sentence summary of what was extracted from this source.",
  "newPages": [
    {
      "slug": "kebab-case-slug",
      "title": "${outputLanguage} display title",
      "type": "concept",
      "content": "Markdown body in ${outputLanguage}. Use [[other-slug]] for cross-links.",
      "tags": ["tag1", "tag2"]
    }
  ],
  "pageUpdates": [
    {
      "slug": "existing-page-slug",
      "content": "Full new body for this page in ${outputLanguage} (entire replacement, not a diff).",
      "updateReason": "Why this update was needed in ${outputLanguage}."
    }
  ],
  "indexEntries": [
    {
      "slug": "page-slug",
      "category": "concepts",
      "summary": "Short one-liner for the index in ${outputLanguage} — aim for 100-150 chars, hard cap 200."
    }
  ],
  "logEntry": "Single-line summary of this ingest in ${outputLanguage}.",
  "contradictions": [
    {
      "description": "Description of what disagrees and where in ${outputLanguage}.",
      "pages": ["slug-a", "slug-b"]
    }
  ]
}

Strict field rules — get any of these wrong and the JSON is rejected:
- "type" on newPages MUST be one of: "entity", "concept", "source", "comparison", "overview" (singular, lowercase).
- "category" on indexEntries MUST be one of: "entities", "concepts", "sources", "comparisons", "overviews" (PLURAL, lowercase). Do NOT use the wiki's topic name.
- "slug" everywhere MUST be kebab-case ([a-z0-9-]+), never capitalized, never spaced.
- "newPages", "pageUpdates", "indexEntries", "contradictions" are ALWAYS arrays. Use [] (not omitted, not null) when empty.
- "summary" and "logEntry" are required strings.`;
}

export type ExistingPageSnippet = {
  slug: string;
  title: string;
  type: Page["frontmatter"]["type"];
  excerpt: string;
};

export type BuildIngestPromptOpts = {
  schema: string;
  index: string;
  outputLanguage: string;
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
  const outputLanguage = opts.outputLanguage.trim() || DEFAULT_OUTPUT_LANGUAGE;
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
    buildSystemRules(outputLanguage),
    "",
    "User schema (CLAUDE.md) — describes the wiki's topic and editorial rules. Do NOT confuse the user's topic with the JSON schema below.",
    fenceMarkdown(opts.schema),
    "",
    "Current wiki index:",
    fenceMarkdown(opts.index),
    "",
    `Existing pages (top ${opts.relevantPages.length} most relevant):`,
    fenceMarkdown(pagesBlock),
    "",
    buildJsonShape(outputLanguage),
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
