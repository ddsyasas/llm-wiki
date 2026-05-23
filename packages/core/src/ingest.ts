import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { callLLM, type LlmClient, type UserContentPart } from "@llm-wiki/llm";

import type { Db } from "./db";
import {
  getPage,
  indexPageForSearch,
  linkPageSource,
  searchPages,
  upsertPage,
} from "./db-pages";
import { insertSource, updateSource } from "./db-sources";
import { upsertSyncState } from "./db-sync";
import { insertUsage } from "./db-usage";
import { parseIndexEntries, renderIndex } from "./index-builder";
import { buildIngestPrompt, type ExistingPageSnippet } from "./prompts/ingest";
import { IngestResponseSchema, type IngestResponse } from "./schema";
import type {
  ExtractedVisionSource,
  PageRow,
  SourceFormat,
  SourceRow,
} from "./types";
import {
  appendLog,
  readIndex,
  readPage,
  readSchema,
  WIKI_PATHS,
  writeIndex,
  writePage,
} from "./wiki";

const PAGE_HISTORY_DIR = "page-history";
const TOP_K_RELEVANT_PAGES = 15;

// ---- Public surface -------------------------------------------------------

export type IngestSourceInput = {
  /** Content extracted from raw/<filename>. For pasted text this equals the body. */
  content: string;
  /** Best-known human title for the source. Becomes the log line + UI label. */
  title: string;
  /** Format hint for the LLM and for log entries. */
  format: SourceFormat;
};

export type IngestProgressEvent =
  | { phase: "context"; message: string }
  | { phase: "llm"; message: string }
  | { phase: "apply"; message: string }
  | { phase: "done"; result: IngestResponse };

export type IngestSourceOptions = {
  source: IngestSourceInput;
  wikiPath: string;
  db: Db;
  client: LlmClient;
  model: string;
  /** Existing sources row id. If omitted, the caller is just dry-running. */
  sourceId?: string;
  onProgress?: (event: IngestProgressEvent) => void;
};

export async function ingestSource(opts: IngestSourceOptions): Promise<IngestResponse> {
  opts.onProgress?.({ phase: "context", message: "Loading wiki schema and index..." });

  const [schema, index] = await Promise.all([
    readSchemaOrDefault(opts.wikiPath),
    readIndexOrDefault(opts.wikiPath),
  ]);

  opts.onProgress?.({
    phase: "context",
    message: `Searching for relevant existing pages…`,
  });
  const relevantPages = await loadRelevantPages(opts.wikiPath, opts.db, opts.source);

  opts.onProgress?.({
    phase: "llm",
    message: `Calling ${opts.model} (this is the slow step)…`,
  });

  const prompt = buildIngestPrompt({
    schema,
    index,
    relevantPages,
    source: {
      title: opts.source.title,
      format: opts.source.format,
      content: opts.source.content,
    },
  });

  const result = await callLLM({
    client: opts.client,
    model: opts.model,
    system: prompt.system,
    user: prompt.user,
    schema: IngestResponseSchema,
  });

  insertUsage(opts.db, {
    operation: "ingest",
    model: result.model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  opts.onProgress?.({
    phase: "apply",
    message: `Writing ${result.data.newPages.length} new pages, updating ${result.data.pageUpdates.length}…`,
  });

  await applyIngestResponse({
    response: result.data,
    wikiPath: opts.wikiPath,
    db: opts.db,
    sourceId: opts.sourceId ?? null,
    sourceTitle: opts.source.title,
    format: opts.source.format,
  });

  opts.onProgress?.({ phase: "done", result: result.data });
  return result.data;
}

// ---- Vision path ----------------------------------------------------------

export type IngestVisionSourceOptions = {
  source: ExtractedVisionSource;
  wikiPath: string;
  db: Db;
  client: LlmClient;
  /** Vision-capable model (settings.defaultModels.vision). */
  model: string;
  sourceId?: string;
  onProgress?: (event: IngestProgressEvent) => void;
};

/**
 * Vision twin of ingestSource. The PDF/image rides along as a multimodal
 * `image_url` content part with a data URL — the LLM does the OCR + extraction
 * itself. Same JSON contract, same apply step.
 */
export async function ingestVisionSource(
  opts: IngestVisionSourceOptions,
): Promise<IngestResponse> {
  opts.onProgress?.({ phase: "context", message: "Loading wiki schema and index..." });
  const [schema, index] = await Promise.all([
    readSchemaOrDefault(opts.wikiPath),
    readIndexOrDefault(opts.wikiPath),
  ]);

  // We don't run FTS5 retrieval for vision sources (we have no text yet).
  // The LLM gets schema + index only; future iterations could pre-OCR for
  // retrieval but V1 keeps it simple.
  const prompt = buildIngestPrompt({
    schema,
    index,
    relevantPages: [],
    source: {
      title: opts.source.title,
      format: opts.source.format,
      content: `(The actual content is attached as a ${opts.source.mediaType} file.)`,
    },
  });

  opts.onProgress?.({
    phase: "llm",
    message: `Calling ${opts.model} with attached ${opts.source.format} (${Math.round(opts.source.sizeBytes / 1024)} KB)…`,
  });

  const userParts: UserContentPart[] = [
    {
      type: "text",
      text: `New source: "${opts.source.title}" (format: ${opts.source.format}, ${Math.round(opts.source.sizeBytes / 1024)} KB).\n\nRead the attached file carefully and produce the JSON response per the schema.`,
    },
    {
      type: "image_url",
      image_url: {
        url: `data:${opts.source.mediaType};base64,${opts.source.base64}`,
      },
    },
  ];

  const result = await callLLM({
    client: opts.client,
    model: opts.model,
    system: prompt.system,
    user: "(see attached file)",
    userParts,
    schema: IngestResponseSchema,
  });

  insertUsage(opts.db, {
    operation: "ingest",
    model: result.model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  opts.onProgress?.({
    phase: "apply",
    message: `Writing ${result.data.newPages.length} new pages, updating ${result.data.pageUpdates.length}…`,
  });

  await applyIngestResponse({
    response: result.data,
    wikiPath: opts.wikiPath,
    db: opts.db,
    sourceId: opts.sourceId ?? null,
    sourceTitle: opts.source.title,
    format: opts.source.format,
  });

  opts.onProgress?.({ phase: "done", result: result.data });
  return result.data;
}

// ---- Raw-save helper ------------------------------------------------------

export type SaveRawOptions = {
  wikiPath: string;
  db: Db;
  buffer: Buffer;
  /** Final extension to use (".md", ".pdf", etc.) Slug + date are auto-derived. */
  ext: string;
  format: SourceFormat;
  title: string;
  originalName?: string;
  url?: string;
};

export type SaveRawResult = {
  sourceId: string;
  rawFilename: string;
  rawPath: string;
};

/**
 * Persists a binary or text source to raw/<date>-<slug>.<ext> and inserts a
 * matching sources row (ingested_at = null). The caller flips ingested_at
 * after the LLM call succeeds.
 */
export async function saveRawSource(opts: SaveRawOptions): Promise<SaveRawResult> {
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(opts.title);
  const ext = opts.ext.startsWith(".") ? opts.ext : `.${opts.ext}`;
  const rawFilename = `${today}-${slug}${ext}`;
  const rawDir = join(opts.wikiPath, WIKI_PATHS.raw);
  await mkdir(rawDir, { recursive: true });
  const rawPath = join(rawDir, rawFilename);
  await writeFile(rawPath, opts.buffer);

  const sourceId = randomUUID();
  const sourceRow: SourceRow = {
    id: sourceId,
    filename: rawFilename,
    original_name: opts.originalName ?? null,
    format: opts.format,
    size_bytes: opts.buffer.length,
    added_at: new Date().toISOString(),
    ingested_at: null,
    url: opts.url ?? null,
    title: opts.title,
  };
  insertSource(opts.db, sourceRow);

  return { sourceId, rawFilename, rawPath };
}

export function markSourceIngested(db: Db, sourceId: string): void {
  // Look up + flip ingested_at; tolerant if the row vanished between calls.
  const existingRows = listSourceRowsById(db, sourceId);
  if (!existingRows) return;
  updateSource(db, { ...existingRows, ingested_at: new Date().toISOString() });
}

function listSourceRowsById(db: Db, id: string): SourceRow | null {
  const row = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as
    | (Omit<SourceRow, "format"> & { format: string })
    | undefined;
  if (!row) return null;
  return row as SourceRow;
}

export type IngestPastedTextOptions = {
  text: string;
  title?: string;
  wikiPath: string;
  db: Db;
  client: LlmClient;
  model: string;
  onProgress?: (event: IngestProgressEvent) => void;
};

export type IngestPastedTextResult = {
  sourceId: string;
  rawFilename: string;
  response: IngestResponse;
};

export async function ingestPastedText(
  opts: IngestPastedTextOptions,
): Promise<IngestPastedTextResult> {
  const cleanTitle = (opts.title ?? deriveTitleFromBody(opts.text)).trim() || "Untitled note";
  const slug = slugify(cleanTitle);
  const today = new Date().toISOString().slice(0, 10);
  const rawFilename = `${today}-${slug}.md`;
  const rawDir = join(opts.wikiPath, WIKI_PATHS.raw);
  await mkdir(rawDir, { recursive: true });
  const rawPath = join(rawDir, rawFilename);
  // We persist pasted notes as markdown so they round-trip cleanly if the user
  // opens them later in Obsidian / VS Code.
  await writeFile(rawPath, `# ${cleanTitle}\n\n${opts.text.trim()}\n`, "utf8");
  const sizeBytes = Buffer.byteLength(opts.text, "utf8");

  const sourceId = randomUUID();
  const sourceRow: SourceRow = {
    id: sourceId,
    filename: rawFilename,
    original_name: null,
    format: "md",
    size_bytes: sizeBytes,
    added_at: new Date().toISOString(),
    ingested_at: null,
    url: null,
    title: cleanTitle,
  };
  insertSource(opts.db, sourceRow);

  try {
    const response = await ingestSource({
      source: { content: opts.text, title: cleanTitle, format: "md" },
      wikiPath: opts.wikiPath,
      db: opts.db,
      client: opts.client,
      model: opts.model,
      sourceId,
      onProgress: opts.onProgress,
    });

    updateSource(opts.db, { ...sourceRow, ingested_at: new Date().toISOString() });
    return { sourceId, rawFilename, response };
  } catch (err) {
    // Source row stays in DB so the UI can show "Not yet ingested" with a Retry
    // affordance later (Step 6 doesn't surface this yet, but the data is there).
    throw err;
  }
}

// ---- Internals ------------------------------------------------------------

async function readSchemaOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readSchema(wikiPath);
  } catch {
    return "(no schema set yet — assume a general-purpose personal wiki)";
  }
}

async function readIndexOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readIndex(wikiPath);
  } catch {
    return "(no index yet)";
  }
}

async function loadRelevantPages(
  wikiPath: string,
  db: Db,
  source: IngestSourceInput,
): Promise<ExistingPageSnippet[]> {
  // FTS5 hates very long queries; pick a query window from the source. Doc 06
  // says use the source content; title + first sentences is a decent proxy.
  const queryText = `${source.title} ${source.content.slice(0, 500)}`;
  let hits: Array<{ slug: string; title: string }> = [];
  try {
    hits = searchPages(db, queryText, TOP_K_RELEVANT_PAGES);
  } catch {
    // Empty FTS5 index (no pages yet) or malformed query — skip silently.
    hits = [];
  }

  const snippets: ExistingPageSnippet[] = [];
  for (const hit of hits) {
    try {
      const page = await readPage(wikiPath, hit.slug);
      snippets.push({
        slug: page.slug,
        title: page.frontmatter.title,
        type: page.frontmatter.type,
        excerpt: page.content,
      });
    } catch {
      // Page in FTS5 but missing on disk — sync drift; ignore for this ingest.
    }
  }
  return snippets;
}

type ApplyOpts = {
  response: IngestResponse;
  wikiPath: string;
  db: Db;
  sourceId: string | null;
  sourceTitle: string;
  format: SourceFormat;
};

async function applyIngestResponse(opts: ApplyOpts): Promise<void> {
  const { response, wikiPath, db, sourceId } = opts;
  const today = new Date().toISOString().slice(0, 10);
  const written: string[] = [];

  for (const np of response.newPages) {
    await writePage(wikiPath, {
      slug: np.slug,
      frontmatter: {
        title: np.title,
        slug: np.slug,
        type: np.type,
        created: today,
        updated: today,
        tags: np.tags,
        ...(sourceId ? { sources: [sourceId] } : {}),
      },
      content: ensureTrailingNewline(np.content),
    });
    upsertWikiRowAndIndex(db, wikiPath, np.slug, np.title, np.type, today, today, np.content, np.tags);
    if (sourceId) linkPageSource(db, np.slug, sourceId);
    written.push(np.slug);
  }

  for (const upd of response.pageUpdates) {
    const existing = await readPageSafe(wikiPath, upd.slug);
    if (!existing) {
      // LLM hallucinated a slug that doesn't exist — promote to a new page so
      // its content isn't lost.
      await writePage(wikiPath, {
        slug: upd.slug,
        frontmatter: {
          title: titleCase(upd.slug),
          slug: upd.slug,
          type: "concept",
          created: today,
          updated: today,
          ...(sourceId ? { sources: [sourceId] } : {}),
        },
        content: ensureTrailingNewline(upd.content),
      });
      upsertWikiRowAndIndex(
        db,
        wikiPath,
        upd.slug,
        titleCase(upd.slug),
        "concept",
        today,
        today,
        upd.content,
        [],
      );
      if (sourceId) linkPageSource(db, upd.slug, sourceId);
      written.push(upd.slug);
      continue;
    }

    await backupPage(wikiPath, upd.slug);
    const mergedSources = sourceId ? mergeUnique(existing.frontmatter.sources, sourceId) : existing.frontmatter.sources;
    await writePage(wikiPath, {
      slug: upd.slug,
      frontmatter: {
        ...existing.frontmatter,
        updated: today,
        ...(mergedSources ? { sources: mergedSources } : {}),
      },
      content: ensureTrailingNewline(upd.content),
    });
    upsertWikiRowAndIndex(
      db,
      wikiPath,
      upd.slug,
      existing.frontmatter.title,
      existing.frontmatter.type,
      existing.frontmatter.created,
      today,
      upd.content,
      existing.frontmatter.tags ?? [],
    );
    if (sourceId) linkPageSource(db, upd.slug, sourceId);
    written.push(upd.slug);
  }

  await rebuildIndex(wikiPath, response, written);

  const logLine = formatLogEntry(opts.sourceTitle, opts.format, response);
  await appendLog(wikiPath, logLine);
}

function upsertWikiRowAndIndex(
  db: Db,
  wikiPath: string,
  slug: string,
  title: string,
  type: PageRow["type"],
  createdAt: string,
  updatedAt: string,
  content: string,
  tags: string[],
): void {
  upsertPage(db, {
    slug,
    title,
    type,
    created_at: createdAt,
    updated_at: updatedAt,
    word_count: wordCount(content),
    tags,
  });
  indexPageForSearch(db, { slug, title, content, tags });
  void recordSyncState(db, wikiPath, slug);
}

async function recordSyncState(db: Db, wikiPath: string, slug: string): Promise<void> {
  const relPath = `${WIKI_PATHS.wiki}/${slug}.md`;
  try {
    const s = await stat(join(wikiPath, relPath));
    upsertSyncState(db, {
      rel_path: relPath,
      mtime_ms: s.mtimeMs,
      size_bytes: s.size,
      synced_at: new Date().toISOString(),
    });
  } catch {
    // race or missing file — next syncWikiToDb will resolve it
  }
}

async function readPageSafe(wikiPath: string, slug: string) {
  try {
    return await readPage(wikiPath, slug);
  } catch {
    return null;
  }
}

async function backupPage(wikiPath: string, slug: string): Promise<void> {
  const src = join(wikiPath, WIKI_PATHS.wiki, `${slug}.md`);
  try {
    await stat(src);
  } catch {
    return;
  }
  const dir = join(wikiPath, WIKI_PATHS.tooling, PAGE_HISTORY_DIR);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await copyFile(src, join(dir, `${slug}-${stamp}.md`));
}

async function rebuildIndex(
  wikiPath: string,
  response: IngestResponse,
  changedSlugs: string[],
): Promise<void> {
  const indexPath = join(wikiPath, WIKI_PATHS.index);
  // Parse the existing index into a flat map slug -> {category, summary} so we
  // can merge the LLM's fresh entries without losing untouched pages.
  let existingText = "";
  try {
    existingText = await readFile(indexPath, "utf8");
  } catch {
    existingText = "";
  }

  const entries = parseIndexEntries(existingText);
  // Drop any entries the LLM is now refreshing.
  for (const e of response.indexEntries) entries.delete(e.slug);
  for (const slug of changedSlugs) entries.delete(slug);
  // Insert the fresh entries.
  for (const e of response.indexEntries) {
    entries.set(e.slug, { category: e.category, summary: e.summary });
  }

  await writeIndex(wikiPath, renderIndex(entries));
}

function formatLogEntry(
  sourceTitle: string,
  format: SourceFormat,
  response: IngestResponse,
): string {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const head = `## [${stamp}] ingest | ${sourceTitle} (${format})`;
  const lines = [head];
  if (response.newPages.length > 0) {
    lines.push(`- created pages: ${response.newPages.map((p) => p.slug).join(", ")}`);
  }
  if (response.pageUpdates.length > 0) {
    lines.push(`- updated pages: ${response.pageUpdates.map((p) => p.slug).join(", ")}`);
  }
  if (response.contradictions.length > 0) {
    lines.push(`- contradictions flagged: ${response.contradictions.length}`);
  }
  if (response.summary) lines.push(`- summary: ${response.summary}`);
  return lines.join("\n");
}

function wordCount(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

function deriveTitleFromBody(text: string): string {
  const first = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return first.replace(/^#+\s*/, "").slice(0, 120) || "Untitled note";
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : ""))
    .join(" ");
}

function mergeUnique<T>(existing: T[] | undefined, next: T): T[] {
  if (!existing) return [next];
  if (existing.includes(next)) return existing;
  return [...existing, next];
}
