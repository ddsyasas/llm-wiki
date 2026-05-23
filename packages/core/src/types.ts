export type PageType = "entity" | "concept" | "source" | "comparison" | "overview";

export const PAGE_TYPES: readonly PageType[] = [
  "entity",
  "concept",
  "source",
  "comparison",
  "overview",
] as const;

export type PageFrontmatter = {
  title: string;
  slug: string;
  type: PageType;
  created: string;
  updated: string;
  sources?: string[];
  tags?: string[];
};

export type Page = {
  slug: string;
  frontmatter: PageFrontmatter;
  content: string;
};

export type PageSummary = {
  slug: string;
  title: string;
  type: PageType;
  updated: string;
};

// ---- SQLite row shapes (docs/03 schema) -----------------------------------
// Suffixed `Row` to distinguish from file-layer types above. Repository
// functions take and return these.

export type SourceFormat =
  | "pdf"
  | "docx"
  | "html"
  | "md"
  | "txt"
  | "url"
  | "image"
  | "pptx"
  | "xlsx";

export const SOURCE_FORMATS: readonly SourceFormat[] = [
  "pdf",
  "docx",
  "html",
  "md",
  "txt",
  "url",
  "image",
  "pptx",
  "xlsx",
] as const;

export type SourceRow = {
  id: string;
  filename: string;
  original_name: string | null;
  format: SourceFormat;
  size_bytes: number;
  added_at: string;
  ingested_at: string | null;
  url: string | null;
  title: string | null;
};

export type PageRow = {
  slug: string;
  title: string;
  type: PageType;
  created_at: string;
  updated_at: string;
  word_count: number;
  tags: string[];
};

export type ChatRow = {
  id: string;
  filename: string;
  folder: string;
  title: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  message_count: number;
};

export type Operation = "ingest" | "query" | "lint" | "chat";

export const OPERATIONS: readonly Operation[] = ["ingest", "query", "lint", "chat"] as const;

export type UsageInsert = {
  operation: Operation;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number | null;
  created_at: string;
};

export type UsageRow = UsageInsert & { id: number };

export type SyncStateRow = {
  rel_path: string;
  mtime_ms: number;
  size_bytes: number;
  synced_at: string;
};

// ---- Extracted source shapes ---------------------------------------------
// Both kinds flow into the ingest pipeline. Text sources embed the body in
// the prompt; vision sources pass through as multimodal content parts.

export type ExtractedTextSource = {
  kind: "text";
  title: string;
  content: string;
  format: SourceFormat;
  metadata: Record<string, unknown>;
  imageUrls?: string[];
};

export type ExtractedVisionSource = {
  kind: "vision";
  title: string;
  format: SourceFormat;
  /** Base64-encoded file body. */
  base64: string;
  /** MIME type, e.g. "application/pdf" or "image/png". */
  mediaType: string;
  /** Original file size in bytes. */
  sizeBytes: number;
  metadata: Record<string, unknown>;
};

export type ExtractedSource = ExtractedTextSource | ExtractedVisionSource;
