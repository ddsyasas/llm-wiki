import { parseOfficeAsync } from "officeparser";

import type { ExtractedTextSource } from "./types";

export async function extractPptx(
  buffer: Buffer,
  filename?: string,
): Promise<ExtractedTextSource> {
  const text = await parseOfficeAsync(buffer);
  return {
    kind: "text",
    title: deriveTitle(text, filename),
    content: text.trim(),
    format: "pptx",
    metadata: {},
  };
}

function deriveTitle(text: string, filename: string | undefined): string {
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (first) return first.slice(0, 120);
  if (filename) return filename.replace(/\.[^.]+$/, "");
  return "Untitled presentation";
}
