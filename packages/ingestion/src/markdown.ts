import matter from "gray-matter";

import type { ExtractedSource } from "./types";

// Markdown with optional YAML frontmatter. We split off the frontmatter so it
// becomes structured metadata rather than noise inside the LLM-visible body.
export function extractMarkdown(buffer: Buffer, filename?: string): ExtractedSource {
  const raw = buffer.toString("utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const titleFromFrontmatter = typeof data["title"] === "string" ? (data["title"] as string) : null;
  const title =
    titleFromFrontmatter ?? deriveTitleFromBody(parsed.content) ?? deriveTitleFromFilename(filename);

  return {
    title,
    content: parsed.content.replace(/^\n/, ""),
    format: "md",
    metadata: data,
  };
}

function deriveTitleFromBody(body: string): string | null {
  // First H1 wins. Skip blank lines and frontmatter remnants.
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("# ")) return trimmed.slice(2).trim();
    // First non-blank non-heading line is plausible enough as a fallback.
    return trimmed.slice(0, 120);
  }
  return null;
}

function deriveTitleFromFilename(filename: string | undefined): string {
  if (!filename) return "Untitled";
  const stem = filename.replace(/\.[^.]+$/, "");
  return stem || "Untitled";
}
