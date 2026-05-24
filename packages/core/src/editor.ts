import { access, copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Db } from "./db";
import {
  deletePage as deletePageRow,
  indexPageForSearch,
  unindexPageFromSearch,
  upsertPage,
} from "./db-pages";
import { upsertSyncState } from "./db-sync";
import {
  parseIndexEntries,
  refreshIndexEntryForSlug,
  renderIndex,
} from "./index-builder";
import { uniqueLinkedSlugs } from "./links";
import type { Page, PageType } from "./types";
import { appendLog, listPages, readPage, WIKI_PATHS, writeIndex, writePage } from "./wiki";

const PAGE_HISTORY_DIR = "page-history";

export type ManualEditInput = {
  /** Body markdown (no frontmatter). */
  content: string;
  /** Optional title change. Other frontmatter fields stay as-is. */
  title?: string;
  /** Optional type change. */
  type?: Page["frontmatter"]["type"];
  /** Optional tag replacement. */
  tags?: string[];
};

export type ManualEditResult = {
  slug: string;
  page: Page;
  /** Path inside .llm-wiki/page-history/ of the backup written before save. */
  backupPath: string | null;
};

/**
 * Applies a user-initiated edit: backs up the prior file, rewrites it with
 * preserved frontmatter (only the provided fields change), upserts the DB
 * row, refreshes the FTS5 index, records sync_state, and appends a log
 * entry. Throws if the slug doesn't exist on disk yet — edits are for
 * existing pages only.
 */
export async function applyManualEdit(
  wikiPath: string,
  db: Db,
  slug: string,
  edit: ManualEditInput,
): Promise<ManualEditResult> {
  const existing = await readPage(wikiPath, slug); // throws ENOENT for unknown slug

  const backupPath = await backupPage(wikiPath, slug);
  const today = new Date().toISOString().slice(0, 10);

  const nextFrontmatter: Page["frontmatter"] = {
    ...existing.frontmatter,
    ...(edit.title !== undefined ? { title: edit.title } : {}),
    ...(edit.type !== undefined ? { type: edit.type } : {}),
    ...(edit.tags !== undefined ? { tags: edit.tags } : {}),
    updated: today,
    slug,
  };

  const nextPage: Page = {
    slug,
    frontmatter: nextFrontmatter,
    content: ensureTrailingNewline(edit.content),
  };
  await writePage(wikiPath, nextPage);

  upsertPage(db, {
    slug,
    title: nextFrontmatter.title,
    type: nextFrontmatter.type,
    created_at: nextFrontmatter.created,
    updated_at: nextFrontmatter.updated,
    word_count: wordCount(nextPage.content),
    tags: nextFrontmatter.tags ?? [],
  });
  indexPageForSearch(db, {
    slug,
    title: nextFrontmatter.title,
    content: nextPage.content,
    tags: nextFrontmatter.tags ?? [],
  });

  try {
    const s = await stat(join(wikiPath, WIKI_PATHS.wiki, `${slug}.md`));
    upsertSyncState(db, {
      rel_path: `${WIKI_PATHS.wiki}/${slug}.md`,
      mtime_ms: s.mtimeMs,
      size_bytes: s.size,
      synced_at: new Date().toISOString(),
    });
  } catch {
    // best effort — next syncWikiToDb will resolve
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  await appendLog(wikiPath, `## [${stamp}] edit | ${nextFrontmatter.title} (${slug})`);

  // Keep index.md in sync with the page body. Otherwise the index summary
  // can drift (e.g., lint kept flagging "page says X but index says Y"
  // after fixes because the index summary was generated from pre-fix
  // content).
  await refreshIndexEntryForSlug(wikiPath, db, slug);

  return { slug, page: nextPage, backupPath };
}

// ---- quick fixes ---------------------------------------------------------

/**
 * Removes every reference to a given target slug from the page body. Both
 * `[[bad]]` and `[[bad|Display]]` forms collapse to plain text. Runs the
 * change through applyManualEdit so a backup + sync_state + log entry are
 * produced.
 */
export async function removeBrokenLink(
  wikiPath: string,
  db: Db,
  pageSlug: string,
  brokenSlug: string,
): Promise<ManualEditResult> {
  const page = await readPage(wikiPath, pageSlug);
  const escaped = brokenSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\[\\[${escaped}(?:\\|([^\\]]+))?\\]\\]`, "g");
  const newContent = page.content.replace(re, (_full, display: string | undefined) => {
    return display && display.length > 0 ? display : brokenSlug;
  });
  if (newContent === page.content) {
    throw new Error(`page ${pageSlug} doesn't contain a [[${brokenSlug}]] reference`);
  }
  return applyManualEdit(wikiPath, db, pageSlug, { content: newContent });
}

// ---- schema (CLAUDE.md) editing -----------------------------------------

const SCHEMA_HISTORY_DIR = "schema-history";
const SCHEMA_HISTORY_LIMIT = 10;

export type SaveSchemaResult = {
  backupPath: string | null;
  prunedCount: number;
};

/**
 * Replaces CLAUDE.md with new content, backing up the prior version into
 * .llm-wiki/schema-history/ (capped at the last SCHEMA_HISTORY_LIMIT
 * snapshots) and appending a log entry. Per docs/04 P0 feature 7.
 */
export async function saveSchema(
  wikiPath: string,
  content: string,
): Promise<SaveSchemaResult> {
  const schemaPath = join(wikiPath, WIKI_PATHS.schema);
  const dir = join(wikiPath, WIKI_PATHS.tooling, SCHEMA_HISTORY_DIR);
  await mkdir(dir, { recursive: true });

  let backupPath: string | null = null;
  try {
    await stat(schemaPath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = join(dir, `CLAUDE-${stamp}.md`);
    await copyFile(schemaPath, backupPath);
  } catch {
    // No existing schema yet — first save.
  }

  await writePage_writeRaw(schemaPath, ensureTrailingNewline(content));

  const prunedCount = await pruneSchemaHistory(dir, SCHEMA_HISTORY_LIMIT);

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  await appendLog(wikiPath, `## [${stamp}] schema | edited CLAUDE.md`);

  return { backupPath, prunedCount };
}

// CLAUDE.md isn't a wiki page (no frontmatter) so writePage isn't applicable.
// Use a direct write — node:fs/promises writeFile via a lazily-imported helper.
async function writePage_writeRaw(path: string, content: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, content, "utf8");
}

async function pruneSchemaHistory(dir: string, limit: number): Promise<number> {
  const { readdir, unlink } = await import("node:fs/promises");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  const backups = entries.filter((f) => f.startsWith("CLAUDE-")).sort(); // ISO timestamps sort lexicographically
  const excess = backups.length - limit;
  if (excess <= 0) return 0;
  for (const f of backups.slice(0, excess)) {
    await unlink(join(dir, f));
  }
  return excess;
}

// ---- create a new page ----------------------------------------------------

export type CreatePageInput = {
  slug: string;
  title: string;
  type: PageType;
  content: string;
  tags?: string[];
  /** Optional source attribution (e.g., a query promotion). */
  sources?: string[];
};

export class PageAlreadyExistsError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`page already exists: ${slug}`);
    this.name = "PageAlreadyExistsError";
    this.slug = slug;
  }
}

/**
 * Creates a brand-new page. Used by the query "Save as wiki page" action and
 * by any future "new blank page" UI. Refuses to overwrite an existing slug —
 * callers should use applyManualEdit for that.
 */
export async function createPage(
  wikiPath: string,
  db: Db,
  input: CreatePageInput,
): Promise<Page> {
  const filePath = join(wikiPath, WIKI_PATHS.wiki, `${input.slug}.md`);
  if (await fileExists(filePath)) {
    throw new PageAlreadyExistsError(input.slug);
  }

  const today = new Date().toISOString().slice(0, 10);
  const tags = input.tags ?? [];
  const page: Page = {
    slug: input.slug,
    frontmatter: {
      title: input.title,
      slug: input.slug,
      type: input.type,
      created: today,
      updated: today,
      ...(tags.length > 0 ? { tags } : {}),
      ...(input.sources && input.sources.length > 0 ? { sources: input.sources } : {}),
    },
    content: ensureTrailingNewline(input.content),
  };
  await writePage(wikiPath, page);

  upsertPage(db, {
    slug: input.slug,
    title: input.title,
    type: input.type,
    created_at: today,
    updated_at: today,
    word_count: wordCount(page.content),
    tags,
  });
  indexPageForSearch(db, {
    slug: input.slug,
    title: input.title,
    content: page.content,
    tags,
  });

  try {
    const s = await stat(filePath);
    upsertSyncState(db, {
      rel_path: `${WIKI_PATHS.wiki}/${input.slug}.md`,
      mtime_ms: s.mtimeMs,
      size_bytes: s.size,
      synced_at: new Date().toISOString(),
    });
  } catch {
    // best effort
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  await appendLog(wikiPath, `## [${stamp}] create | ${input.title} (${input.slug})`);

  // Add this slug to index.md so the new page is visible from /wiki without
  // waiting for the next ingest or rebuild.
  await refreshIndexEntryForSlug(wikiPath, db, input.slug);

  return page;
}

// ---- soft delete + restore for wiki pages -------------------------------

const WIKI_TRASH_DIR = "trash/wiki";

export type SoftDeletePageResult = {
  slug: string;
  /** Filename inside .llm-wiki/trash/wiki/ — pass back to restoreDeletedPage. */
  trashFilename: string;
  /** Absolute path on disk, surfaced for "Recoverable from <path>" UI text. */
  trashPath: string;
  /** Pages that linked to this slug. Now broken; lint will flag them. */
  backlinkSlugs: string[];
};

export class PageNotFoundError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`page not found: ${slug}`);
    this.name = "PageNotFoundError";
    this.slug = slug;
  }
}

/**
 * Soft-deletes a wiki page. Moves the .md file to
 * `.llm-wiki/trash/wiki/<timestamp>-<slug>.md` (recoverable for 30 days via
 * the existing purgeOldTrash cleanup), drops the SQLite + FTS5 rows, and
 * strips the slug's entry from index.md. Wiki pages that linked to this
 * slug are NOT touched — those references become broken links and surface
 * in the next lint run.
 *
 * Pair with restoreDeletedPage() if the user clicks Undo.
 */
export async function softDeletePage(
  wikiPath: string,
  db: Db,
  slug: string,
): Promise<SoftDeletePageResult> {
  const filePath = join(wikiPath, WIKI_PATHS.wiki, `${slug}.md`);
  if (!(await fileExists(filePath))) {
    throw new PageNotFoundError(slug);
  }

  // Count inbound links so the caller can warn the user before deleting.
  const allPages = await listPages(wikiPath);
  const backlinkSlugs: string[] = [];
  for (const summary of allPages) {
    if (summary.slug === slug) continue;
    try {
      const page = await readPage(wikiPath, summary.slug);
      if (uniqueLinkedSlugs(page.content).has(slug)) {
        backlinkSlugs.push(summary.slug);
      }
    } catch {
      // page deleted between listing and read; skip
    }
  }

  // Move to trash. Timestamp-prefixed so the same slug can be deleted +
  // restored + deleted again without name collisions.
  const trashDir = join(wikiPath, WIKI_PATHS.tooling, WIKI_TRASH_DIR);
  await mkdir(trashDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const trashFilename = `${stamp}-${slug}.md`;
  const trashPath = join(trashDir, trashFilename);
  await rename(filePath, trashPath);

  // DB + FTS5 + index cleanup. Cascades: page_sources rows drop via FK.
  deletePageRow(db, slug);
  unindexPageFromSearch(db, slug);

  // Strip just this slug's line from index.md (cheaper than a full rebuild
  // and avoids re-reading every page on disk).
  const indexPath = join(wikiPath, WIKI_PATHS.index);
  try {
    const raw = await readFile(indexPath, "utf8");
    const entries = parseIndexEntries(raw);
    if (entries.delete(slug)) {
      await writeIndex(wikiPath, renderIndex(entries));
    }
  } catch {
    // No index.md yet, nothing to strip.
  }

  const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
  await appendLog(
    wikiPath,
    `## [${ts}] delete | ${slug} (trashed → ${WIKI_TRASH_DIR}/${trashFilename})`,
  );

  return { slug, trashFilename, trashPath, backlinkSlugs };
}

export type RestoreDeletedPageResult = {
  slug: string;
  page: Page;
};

export class PageRestoreConflictError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(
      `cannot restore: a page already exists at slug "${slug}". Rename or delete it first, or restore the trash file manually.`,
    );
    this.name = "PageRestoreConflictError";
    this.slug = slug;
  }
}

/**
 * Restores a soft-deleted page by moving the trash file back to wiki/<slug>.md
 * and re-populating the DB + FTS5 + index. Refuses if a new page now occupies
 * the same slug (caller should surface the error and let the user resolve
 * the conflict manually).
 *
 * Note: page_sources links are NOT restored — they cascaded on delete and
 * we don't keep a separate audit log of what they were. Re-ingesting the
 * source(s) would re-create them. For now, the restored page is "lineage-
 * orphan" until then; the body content is intact.
 */
export async function restoreDeletedPage(
  wikiPath: string,
  db: Db,
  slug: string,
  trashFilename: string,
): Promise<RestoreDeletedPageResult> {
  // Refuse to clobber a real page.
  const filePath = join(wikiPath, WIKI_PATHS.wiki, `${slug}.md`);
  if (await fileExists(filePath)) {
    throw new PageRestoreConflictError(slug);
  }

  // Validate the trash file exists + lives under our trash dir (defense
  // against a malicious caller passing "../etc/passwd").
  const trashDir = join(wikiPath, WIKI_PATHS.tooling, WIKI_TRASH_DIR);
  const trashPath = join(trashDir, trashFilename);
  // Reject anything that escapes the trash dir.
  if (!trashPath.startsWith(trashDir + "/") && trashPath !== trashDir) {
    throw new Error("trashFilename must not contain path separators");
  }
  if (!(await fileExists(trashPath))) {
    throw new Error(`trash file not found: ${trashFilename}`);
  }

  await rename(trashPath, filePath);

  // Re-populate DB + FTS5 from the restored file.
  const page = await readPage(wikiPath, slug);
  const today = new Date().toISOString().slice(0, 10);
  const tags = page.frontmatter.tags ?? [];
  upsertPage(db, {
    slug,
    title: page.frontmatter.title,
    type: page.frontmatter.type,
    created_at: page.frontmatter.created,
    updated_at: page.frontmatter.updated || today,
    word_count: wordCount(page.content),
    tags,
  });
  indexPageForSearch(db, {
    slug,
    title: page.frontmatter.title,
    content: page.content,
    tags,
  });

  try {
    const s = await stat(filePath);
    upsertSyncState(db, {
      rel_path: `${WIKI_PATHS.wiki}/${slug}.md`,
      mtime_ms: s.mtimeMs,
      size_bytes: s.size,
      synced_at: new Date().toISOString(),
    });
  } catch {
    // best-effort
  }

  // Add to index.md if it wasn't already there.
  await refreshIndexEntryForSlug(wikiPath, db, slug);

  const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
  await appendLog(wikiPath, `## [${ts}] restore | ${slug} (from trash)`);

  return { slug, page };
}

// ---- internals ----------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function backupPage(wikiPath: string, slug: string): Promise<string | null> {
  const src = join(wikiPath, WIKI_PATHS.wiki, `${slug}.md`);
  try {
    await stat(src);
  } catch {
    return null;
  }
  const dir = join(wikiPath, WIKI_PATHS.tooling, PAGE_HISTORY_DIR);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(dir, `${slug}-${stamp}.md`);
  await copyFile(src, dest);
  return dest;
}

function wordCount(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}
