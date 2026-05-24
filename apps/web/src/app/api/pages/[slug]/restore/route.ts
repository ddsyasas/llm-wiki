import { NextResponse } from "next/server";

import { PageRestoreConflictError, restoreDeletedPage } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// POST /api/pages/[slug]/restore — restore a soft-deleted page.
//
// Body: { trashFilename: string } — the filename returned by the delete
// endpoint. Refuses if a different page now occupies the same slug
// (returns 409 Conflict so the UI can prompt the user to resolve manually).
export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
) {
  let body: { trashFilename?: string } = {};
  try {
    body = (await req.json()) as { trashFilename?: string };
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.trashFilename !== "string" || body.trashFilename.length === 0) {
    return NextResponse.json(
      { error: "trashFilename is required" },
      { status: 400 },
    );
  }

  const ctx = await openWikiContext();
  try {
    const result = await restoreDeletedPage(
      ctx.wikiPath,
      ctx.db,
      params.slug,
      body.trashFilename,
    );
    return NextResponse.json({ ok: true, slug: result.slug });
  } catch (err) {
    if (err instanceof PageRestoreConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "restore failed" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}
