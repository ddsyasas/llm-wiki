import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { Db } from "./db";
import { indexPageForSearch, upsertPage } from "./db-pages";
import { upsertSyncState } from "./db-sync";
import type { Page } from "./types";
import { appendLog, readPage, WIKI_PATHS, writePage } from "./wiki";

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

  return { slug, page: nextPage, backupPath };
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
