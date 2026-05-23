import { parseOfficeAsync } from "officeparser";

import type { ExtractedTextSource } from "./types";

export async function extractXlsx(
  buffer: Buffer,
  filename?: string,
): Promise<ExtractedTextSource> {
  const text = await parseOfficeAsync(buffer);
  return {
    kind: "text",
    title: filename ? filename.replace(/\.[^.]+$/, "") : "Untitled spreadsheet",
    content: text.trim(),
    format: "xlsx",
    metadata: {},
  };
}
