import { NextResponse } from "next/server";

import { listSourceRows } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// GET /api/sources — list of every raw source the user has added, with a
// rough count of how many wiki pages each one contributed to. The page-count
// is a join against page_sources; not via a core helper because no UI
// elsewhere needs it yet.
export async function GET() {
  const ctx = await openWikiContext();
  try {
    const rows = listSourceRows(ctx.db);
    // Single batch query rather than N round-trips.
    const counts = ctx.db
      .prepare(`SELECT source_id, COUNT(*) AS n FROM page_sources GROUP BY source_id`)
      .all() as Array<{ source_id: string; n: number }>;
    const byId = new Map(counts.map((c) => [c.source_id, c.n]));
    const out = rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      originalName: r.original_name,
      format: r.format,
      sizeBytes: r.size_bytes,
      addedAt: r.added_at,
      ingestedAt: r.ingested_at,
      url: r.url,
      title: r.title,
      pageCount: byId.get(r.id) ?? 0,
    }));
    return NextResponse.json({ sources: out, wikiPath: ctx.wikiPath });
  } finally {
    ctx.db.close();
  }
}
