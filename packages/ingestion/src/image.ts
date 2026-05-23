import type { ExtractedVisionSource } from "./types";

// Common image MIME types we map from file extension. The detect.ts magic-byte
// sniffer covers PNG/JPEG; for everything else we trust the extension.
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function extractImage(buffer: Buffer, filename?: string): ExtractedVisionSource {
  const ext = filename ? (filename.split(".").pop() ?? "").toLowerCase() : "";
  const mediaType = MIME_BY_EXT[ext] ?? "image/png";
  return {
    kind: "vision",
    title: filename ? filename.replace(/\.[^.]+$/, "") : "Untitled image",
    format: "image",
    base64: buffer.toString("base64"),
    mediaType,
    sizeBytes: buffer.length,
    metadata: {},
  };
}
