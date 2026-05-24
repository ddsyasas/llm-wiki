// Server-only helpers that resolve the active wiki path and open the
// per-wiki resources (settings + SQLite). Used by API routes; not for
// client components.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { redirect } from "next/navigation";

import {
  backfillUsageCosts,
  getApiKey,
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

// Track which wikis we've already cost-backfilled this process lifetime.
// Backfill is for rows from the pre-fix era (where every insertUsage hard-
// coded cost_cents: null); once per wiki per process is enough. Switching
// wikis adds the new path to the set on first open.
const backfilledWikis = new Set<string>();

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

  // One-shot cost backfill per wiki per process. Picks up any usage rows
  // from before the cost_cents fix (2026-05-24) and fills them in from
  // the pricing table. NULL stays NULL for unknown models.
  if (!backfilledWikis.has(wikiPath)) {
    backfilledWikis.add(wikiPath);
    try {
      backfillUsageCosts(db);
    } catch {
      // Non-fatal — dashboard just shows a smaller cumulative.
    }
  }

  return { wikiPath, db, settings };
}

/**
 * Page-level redirect gate for protected routes — the equivalent of the
 * `next/navigation` middleware pattern, but since Next 14 middleware runs
 * on the Edge runtime (no `node:fs` access to `~/.llm-wiki/config.json`)
 * we do the check in each protected page's server component instead.
 *
 * Drops the user back at `/` if either:
 * - no OpenRouter API key is configured (any operation would fail loud)
 * - the active wiki has no topic set (the LLM has no scope to work in)
 *
 * `/` itself runs the onboarding wizard for these cases, so this is a
 * one-line redirect at the top of each protected page.
 *
 * Pages that opt in: `/wiki`, `/wiki/[slug]`, `/sources`, `/sources/[id]`,
 * `/query`, `/chats`, `/chats/[id]`, `/lint`, `/log`, `/graph`, `/schema`.
 * Pages that don't: `/`, `/about`, `/help`, `/developers`, `/settings`
 * (the user needs to be able to reach Settings to configure things).
 */
export async function requireSetup(): Promise<void> {
  const [apiKeyStatus, settings] = await Promise.all([
    getApiKey(),
    loadWikiSettings(resolveWikiPath()),
  ]);
  const needsKey = apiKeyStatus.key === null;
  const needsTopic = settings.topic.trim().length === 0;
  if (needsKey || needsTopic) {
    redirect("/");
  }
}
