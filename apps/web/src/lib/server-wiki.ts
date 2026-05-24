// Server-only helpers that resolve the active wiki path and open the
// per-wiki resources (settings + SQLite). Used by API routes; not for
// client components.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  globalConfigPath,
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

/**
 * Resolution order (docs/13-multi-wiki.md):
 * 1. `LLM_WIKI_PATH` env var — explicit override, wins. Useful for CI,
 *    scripting, and the CLI's `start <folder>` form.
 * 2. `activeWiki` in `~/.llm-wiki/config.json` — set by Settings → Wikis
 *    picker. The canonical user-facing mechanism for switching wikis
 *    without a server restart.
 * 3. `~/llm-wiki-default` — first-run fallback so the app boots usefully
 *    before the user has named a wiki.
 *
 * Sync read of the config file because this runs inside server-component
 * render paths and we don't want to make every page async on a tiny,
 * OS-cached JSON file. Failures fall through to the default silently.
 */
export function resolveWikiPath(): string {
  const fromEnv = process.env["LLM_WIKI_PATH"];
  if (fromEnv) return fromEnv;
  try {
    const raw = readFileSync(globalConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as { activeWiki?: unknown };
    if (typeof parsed.activeWiki === "string" && parsed.activeWiki.length > 0) {
      return parsed.activeWiki;
    }
  } catch {
    // ENOENT (no config yet) or malformed JSON — fall through to default.
  }
  return join(homedir(), "llm-wiki-default");
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
