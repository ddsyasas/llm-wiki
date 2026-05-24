import { NextResponse } from "next/server";

import { getLintHistory } from "@llm-wiki/core";

import { resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// GET /api/lint/history?limit=10 — recent lint runs parsed from log.md,
// newest first. Returns wikiPath too so the UI can show where log.md
// lives (otherwise users have no clue where the on-disk file is).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("limit");
  const parsed = raw ? parseInt(raw, 10) : 10;
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;

  const wikiPath = resolveWikiPath();
  const history = await getLintHistory(wikiPath, limit);
  return NextResponse.json({ history, wikiPath });
}
