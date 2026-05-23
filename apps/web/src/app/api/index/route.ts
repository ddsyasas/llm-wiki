import { NextResponse } from "next/server";

import { listPageRows, readIndex } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await openWikiContext();
  try {
    let content = "";
    try {
      content = await readIndex(ctx.wikiPath);
    } catch {
      content = "# Wiki Index\n\n_No pages yet. Add a source to get started._\n";
    }
    const knownSlugs = listPageRows(ctx.db).map((r) => r.slug);
    return NextResponse.json({ content, knownSlugs, wikiPath: ctx.wikiPath });
  } finally {
    ctx.db.close();
  }
}
