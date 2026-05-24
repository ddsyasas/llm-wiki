import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { NextResponse } from "next/server";

import {
  getTotalCostCents,
  listChatRows,
  listPageRows,
  listSourceRows,
  loadGlobalConfig,
  loadWikiSettings,
  openDb,
  WIKI_PATHS,
} from "@llm-wiki/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WikiHealth = {
  path: string;
  topic: string | null;
  exists: boolean;
  isActive: boolean;
  /** Null when the wiki folder is missing or hasn't been opened by the app yet. */
  initialized: boolean;
  pageCount: number;
  sourceCount: number;
  chatCount: number;
  costCents: number;
  /** Folder mtime in ms since epoch. Null when the folder is missing. */
  lastTouchedMs: number | null;
};

function defaultWikiPath(): string {
  return join(homedir(), "llm-wiki-default");
}

async function gatherHealth(path: string, isActive: boolean): Promise<WikiHealth> {
  const base: Omit<WikiHealth, "topic" | "initialized" | "pageCount" | "sourceCount" | "chatCount" | "costCents" | "lastTouchedMs"> = {
    path,
    exists: false,
    isActive,
  };

  let exists = false;
  let lastTouchedMs: number | null = null;
  try {
    const s = await stat(path);
    exists = s.isDirectory();
    lastTouchedMs = s.mtimeMs;
  } catch {
    exists = false;
  }
  if (!exists) {
    return {
      ...base,
      topic: null,
      initialized: false,
      pageCount: 0,
      sourceCount: 0,
      chatCount: 0,
      costCents: 0,
      lastTouchedMs: null,
    };
  }

  let topic: string | null = null;
  try {
    const settings = await loadWikiSettings(path);
    topic = settings.topic.trim() || null;
  } catch {
    topic = null;
  }

  // Only open the DB if the tooling dir already exists. openDb() creates the
  // dir as a side effect — for a wiki the user hasn't actually opened yet,
  // that would silently materialize .llm-wiki/ under their folder. Better to
  // report "not initialized" than to mutate disk on a read endpoint.
  let initialized = false;
  try {
    await stat(join(path, WIKI_PATHS.tooling));
    initialized = true;
  } catch {
    initialized = false;
  }

  if (!initialized) {
    return {
      ...base,
      exists: true,
      topic,
      initialized: false,
      pageCount: 0,
      sourceCount: 0,
      chatCount: 0,
      costCents: 0,
      lastTouchedMs,
    };
  }

  const db = openDb(path);
  try {
    const pageCount = listPageRows(db).length;
    const sourceCount = listSourceRows(db).length;
    const chatCount = listChatRows(db).length;
    const costCents = getTotalCostCents(db);
    return {
      ...base,
      exists: true,
      topic,
      initialized: true,
      pageCount,
      sourceCount,
      chatCount,
      costCents,
      lastTouchedMs,
    };
  } finally {
    db.close();
  }
}

// GET /api/wikis/health — aggregate per-wiki stats for /dashboard. Walks
// the recents list plus the active wiki (in case it's not in recents yet),
// opens each DB read-only, and returns counts + spend + folder mtime.
// Sorted by lastTouchedMs descending so the most recently used wikis
// surface first.
export async function GET() {
  const cfg = await loadGlobalConfig();
  const activePath = cfg.activeWiki ?? defaultWikiPath();
  // Dedupe — active wiki is often also in recents.
  const all = Array.from(new Set([activePath, ...cfg.recentWikis]));
  const wikis = await Promise.all(all.map((p) => gatherHealth(p, p === activePath)));
  wikis.sort((a, b) => (b.lastTouchedMs ?? 0) - (a.lastTouchedMs ?? 0));
  return NextResponse.json({ wikis });
}
