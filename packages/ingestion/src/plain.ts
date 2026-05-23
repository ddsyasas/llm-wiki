import type { ExtractedSource } from "./types";

// Treat plain text as a markdown body. We don't escape special chars — if the
// user has * or # in their notes that's their intent.
export function extractPlain(buffer: Buffer, filename?: string): ExtractedSource {
  const content = buffer.toString("utf8");
  const title = filename ? stripExtension(filename) : firstLineAsTitle(content);
  return {
    title,
    content,
    format: "txt",
    metadata: {},
  };
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function firstLineAsTitle(content: string): string {
  const first = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!first) return "Untitled";
  // Trim leading markdown heading chars if present.
  return first.replace(/^#+\s*/, "").slice(0, 120);
}
