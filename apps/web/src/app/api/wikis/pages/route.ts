import { stat } from "node:fs/promises";

import { NextResponse } from "next/server";

import {
  listPageRows,
  loadGlobalConfig,
  loadWikiSettings,
  openDb,
} from "@llm-wiki/core";

import { resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

type CrossWikiPage = {
  wikiPath: string;
  wikiTopic: string | null;
  isActive: boolean;
  slug: string;
  title: string;
  type: string;
};

// GET /api/wikis/pages — flat list of every wiki page across every registered
// wiki, with wiki-level metadata attached. Powers the Cmd+K "Cross-wiki
// pages" group so users can find a page in wiki Y while sitting in wiki X.
//
// Each row is small (just the slug + title + type + parent-wiki metadata),
// so the aggregate stays under ~50KB even for a user with 10 wikis × 100
// pages each.
export async function GET() {
  const cfg = await loadGlobalConfig();
  const activePath = cfg.activeWiki ?? resolveWikiPath();

  // Deduplicate: active wiki may or may not be in recentWikis. Always
  // include it.
  const paths = Array.from(new Set([activePath, ...cfg.recentWikis]));

  const out: CrossWikiPage[] = [];
  await Promise.all(
    paths.map(async (wikiPath) => {
      // Skip wikis whose folder has been removed from disk — they'd appear
      // as "missing folder" rows in /settings → wikis; no point including
      // their pages in cross-wiki search.
      try {
        const s = await stat(wikiPath);
        if (!s.isDirectory()) return;
      } catch {
        return;
      }

      let wikiTopic: string | null = null;
      try {
        const settings = await loadWikiSettings(wikiPath);
        wikiTopic = settings.topic.trim() || null;
      } catch {
        wikiTopic = null;
      }

      let db;
      try {
        db = openDb(wikiPath);
      } catch {
        return;
      }
      try {
        const rows = listPageRows(db);
        for (const r of rows) {
          out.push({
            wikiPath,
            wikiTopic,
            isActive: wikiPath === activePath,
            slug: r.slug,
            title: r.title,
            type: r.type,
          });
        }
      } finally {
        db.close();
      }
    }),
  );

  return NextResponse.json({ pages: out, activePath });
}
