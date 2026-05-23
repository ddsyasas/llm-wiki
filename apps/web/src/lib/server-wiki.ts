// Server-only helpers that resolve the active wiki path and open the
// per-wiki resources (settings + SQLite). Used by API routes; not for
// client components.

import { homedir } from "node:os";
import { join } from "node:path";

import {
  initWikiFolder,
  loadWikiSettings,
  openDb,
  purgeOldTrash,
  syncWikiToDb,
  type Db,
  type WikiSettings,
} from "@llm-wiki/core";

// Throttle the trash purge so we don't crawl the trash dir on every API call.
// One purge per process per hour is plenty for V1.
let lastPurgeMs = 0;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export function resolveWikiPath(): string {
  // The CLI (Step 13) will pass the user-chosen folder via env. Until then,
  // use a dev default so the UI is always operable.
  return process.env["LLM_WIKI_PATH"] ?? join(homedir(), "llm-wiki-default");
}

export type WikiContext = {
  wikiPath: string;
  db: Db;
  settings: WikiSettings;
};

/**
 * Ensures the wiki folder is initialized, opens the DB, runs an idempotent
 * sync from disk, and returns the per-request context.
 *
 * The DB connection stays open for the lifetime of the request — callers
 * MUST close it when done (typical pattern: try/finally in the route).
 */
export async function openWikiContext(): Promise<WikiContext> {
  const wikiPath = resolveWikiPath();
  await initWikiFolder(wikiPath); // idempotent
  const db = openDb(wikiPath);
  try {
    await syncWikiToDb(wikiPath, db);
  } catch (err) {
    db.close();
    throw err;
  }
  const settings = await loadWikiSettings(wikiPath);

  // Best-effort 30-day trash cleanup. Throttled, errors ignored.
  if (Date.now() - lastPurgeMs > PURGE_INTERVAL_MS) {
    lastPurgeMs = Date.now();
    purgeOldTrash(wikiPath).catch(() => {});
  }

  return { wikiPath, db, settings };
}
