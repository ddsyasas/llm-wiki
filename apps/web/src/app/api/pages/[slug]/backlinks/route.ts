import { NextResponse } from "next/server";

import { findBacklinks } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await openWikiContext();
  try {
    const backlinks = await findBacklinks(ctx.db, ctx.wikiPath, params.slug);
    return NextResponse.json({ slug: params.slug, backlinks });
  } finally {
    ctx.db.close();
  }
}
