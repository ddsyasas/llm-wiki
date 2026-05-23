import { NextResponse } from "next/server";

import { listPageRows } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await openWikiContext();
  try {
    const rows = listPageRows(ctx.db);
    const knownSlugs = rows.map((r) => r.slug);
    return NextResponse.json({
      pages: rows.map((r) => ({
        slug: r.slug,
        title: r.title,
        type: r.type,
        updated_at: r.updated_at,
        tags: r.tags,
      })),
      knownSlugs,
      wikiPath: ctx.wikiPath,
    });
  } finally {
    ctx.db.close();
  }
}
