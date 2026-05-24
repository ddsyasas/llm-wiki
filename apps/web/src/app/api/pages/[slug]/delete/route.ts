import { NextResponse } from "next/server";

import { PageNotFoundError, softDeletePage } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// POST /api/pages/[slug]/delete — soft-delete a wiki page.
//
// Moves wiki/<slug>.md to .llm-wiki/trash/wiki/<timestamp>-<slug>.md
// (recoverable for 30 days via the existing purgeOldTrash cleanup),
// drops the SQLite + FTS5 rows, strips the slug's entry from index.md,
// and appends a log entry. Wiki pages that linked here become broken
// links — surfaced in the next lint run.
//
// Response includes the trashFilename so the client can offer Undo via
// POST /api/pages/[slug]/restore { trashFilename }.
export async function POST(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const ctx = await openWikiContext();
  try {
    const result = await softDeletePage(ctx.wikiPath, ctx.db, params.slug);
    return NextResponse.json({
      ok: true,
      slug: result.slug,
      trashFilename: result.trashFilename,
      trashPath: result.trashPath,
      backlinkSlugs: result.backlinkSlugs,
    });
  } catch (err) {
    if (err instanceof PageNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "delete failed" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}
