import type { SourceFormat } from "@llm-wiki/core";

export type { SourceFormat };

// Shared shape returned by every extractor. Format-specific modules normalize
// their input into this so the LLM ingest call doesn't care what kind of file
// it originated from.
export type ExtractedSource = {
  title: string;
  content: string;
  format: SourceFormat;
  metadata: Record<string, unknown>;
  imageUrls?: string[];
};
