import type { ExtractedVisionSource } from "./types";

export function extractPdf(buffer: Buffer, filename?: string): ExtractedVisionSource {
  return {
    kind: "vision",
    title: filename ? filename.replace(/\.[^.]+$/, "") : "Untitled PDF",
    format: "pdf",
    base64: buffer.toString("base64"),
    mediaType: "application/pdf",
    sizeBytes: buffer.length,
    metadata: {},
  };
}
