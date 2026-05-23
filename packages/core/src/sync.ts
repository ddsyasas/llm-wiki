import { readdir, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

import chokidar, { type FSWatcher } from "chokidar";

import type { Db } from "./db";
import {
  deletePage,
  indexPageForSearch,
  unindexPageFromSearch,
  upsertPage,
} from "./db-pages";
import { deleteSyncState, getSyncState, listSyncedPaths, upsertSyncState } from "./db-sync";
import type { PageRow } from "./types";
import { readPage, WIKI_PATHS } from "./wiki";

export type SyncResult = {
  added: string[];
  updated: string[];
  deleted: string[];
  skipped: string[];
  errors: Array<{ slug: string; error: string }>;
};

const PAGE_PREFIX = `${WIKI_PATHS.wiki}/`;

function emptyResult(): SyncResult {
  return { added: [], updated: [], deleted: [], skipped: [], errors: [] };
}

function wordCount(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

function slugFromPagePath(relPath: string): string {
  // relPath is always posix-joined here (e.g. "wiki/shors-algorithm.md").
  return basename(relPath, ".md");
}

async function syncPageFile(
  db: Db,
  wikiPath: string,
  relPath: string,
  result: SyncResult,
): Promise<void> {
  const absolute = join(wikiPath, relPath);
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(absolute);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  const prior = getSyncState(db, relPath);
  if (prior && prior.mtime_ms === s.mtimeMs && prior.size_bytes === s.size) {
    result.skipped.push(slugFromPagePath(relPath));
    return;
  }

  const slug = slugFromPagePath(relPath);
  let page;
  try {
    page = await readPage(wikiPath, slug);
  } catch (err) {
    result.errors.push({ slug, error: (err as Error).message });
    return;
  }

  const row: PageRow = {
    slug,
    title: page.frontmatter.title,
    type: page.frontmatter.type,
    created_at: page.frontmatter.created,
    updated_at: page.frontmatter.updated,
    word_count: wordCount(page.content),
    tags: page.frontmatter.tags ?? [],
  };
  upsertPage(db, row);
  indexPageForSearch(db, {
    slug,
    title: row.title,
    content: page.content,
    tags: row.tags,
  });
  upsertSyncState(db, {
    rel_path: relPath,
    mtime_ms: s.mtimeMs,
    size_bytes: s.size,
    synced_at: new Date().toISOString(),
  });
  (prior ? result.updated : result.added).push(slug);
}

function removePageBySlug(db: Db, slug: string, relPath: string): void {
  deletePage(db, slug);
  unindexPageFromSearch(db, slug);
  deleteSyncState(db, relPath);
}

export async function syncWikiToDb(wikiPath: string, db: Db): Promise<SyncResult> {
  const result = emptyResult();
  const wikiDir = join(wikiPath, WIKI_PATHS.wiki);

  let entries: string[] = [];
  try {
    entries = await readdir(wikiDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // No wiki/ yet — still purge any orphaned page rows from a prior life.
  }

  const fileSlugs = new Set<string>();
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const relPath = `${PAGE_PREFIX}${name}`;
    await syncPageFile(db, wikiPath, relPath, result);
    fileSlugs.add(name.slice(0, -3));
  }

  // Orphan cleanup: any page tracked in sync_state under wiki/ that no longer
  // has a file on disk.
  for (const relPath of listSyncedPaths(db, PAGE_PREFIX)) {
    const slug = slugFromPagePath(relPath);
    if (!fileSlugs.has(slug)) {
      removePageBySlug(db, slug, relPath);
      result.deleted.push(slug);
    }
  }

  return result;
}

// ---- live watcher ---------------------------------------------------------

export type WatchOptions = {
  /**
   * Called after each successfully processed event. Useful for tests and for
   * surfacing live updates to the UI via SSE. The result delta will have at
   * most one entry across {added, updated, deleted}.
   */
  onChange?: (delta: SyncResult) => void;
  /**
   * Called when a watcher error fires. Defaults to console.error so silent
   * failures don't go unnoticed.
   */
  onError?: (err: unknown) => void;
};

export type WikiWatcher = {
  stop: () => Promise<void>;
  ready: Promise<void>;
};

export function watchWiki(wikiPath: string, db: Db, opts: WatchOptions = {}): WikiWatcher {
  const wikiDir = join(wikiPath, WIKI_PATHS.wiki);
  // ignoreInitial: chokidar would otherwise fire `add` for every existing
  // file at startup. We expect callers to run syncWikiToDb first for that
  // backfill, then watch for ongoing changes.
  const watcher: FSWatcher = chokidar.watch(wikiDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const handleUpsert = async (absolute: string) => {
    if (!absolute.endsWith(".md")) return;
    const relPath = toPosix(relative(wikiPath, absolute));
    const delta = emptyResult();
    try {
      await syncPageFile(db, wikiPath, relPath, delta);
    } catch (err) {
      opts.onError?.(err);
      return;
    }
    if (opts.onChange) opts.onChange(delta);
  };

  const handleUnlink = (absolute: string) => {
    if (!absolute.endsWith(".md")) return;
    const relPath = toPosix(relative(wikiPath, absolute));
    const slug = slugFromPagePath(relPath);
    try {
      removePageBySlug(db, slug, relPath);
    } catch (err) {
      opts.onError?.(err);
      return;
    }
    if (opts.onChange) opts.onChange({ ...emptyResult(), deleted: [slug] });
  };

  watcher.on("add", (p) => void handleUpsert(p));
  watcher.on("change", (p) => void handleUpsert(p));
  watcher.on("unlink", (p) => handleUnlink(p));
  watcher.on("error", (err) => opts.onError?.(err));

  const ready = new Promise<void>((resolve) => {
    watcher.once("ready", () => resolve());
  });

  return {
    ready,
    stop: () => watcher.close(),
  };
}
