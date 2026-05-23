// Server-only helpers that resolve the active wiki path and open the
// per-wiki resources (settings + SQLite). Used by API routes; not for
// client components.

import { homedir } from "node:os";
import { join } from "node:path";

import {
  initWikiFolder,
  loadWikiSettings,
  openDb,
  syncWikiToDb,
  type Db,
  type WikiSettings,
} from "@llm-wiki/core";

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
  return { wikiPath, db, settings };
}
