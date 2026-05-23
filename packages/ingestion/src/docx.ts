import mammoth from "mammoth";
import TurndownService from "turndown";

import type { ExtractedTextSource } from "./types";

export async function extractDocx(
  buffer: Buffer,
  filename?: string,
): Promise<ExtractedTextSource> {
  // mammoth produces HTML; we turndown to markdown for parity with the rest
  // of the pipeline. Tables stay as HTML inside the markdown body (acceptable
  // for V1).
  const result = await mammoth.convertToHtml({ buffer });
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    bulletListMarker: "-",
  });
  const content = turndown.turndown(result.value).trim();
  const title = deriveTitle(content, filename);

  const messages = result.messages
    .filter((m) => m.type === "warning" || m.type === "error")
    .map((m) => m.message);

  return {
    kind: "text",
    title,
    content,
    format: "docx",
    metadata: messages.length > 0 ? { mammothMessages: messages } : {},
  };
}

function deriveTitle(content: string, filename: string | undefined): string {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("# ")) return trimmed.slice(2).trim();
    return trimmed.slice(0, 120);
  }
  if (filename) return filename.replace(/\.[^.]+$/, "");
  return "Untitled document";
}
