import { NextResponse } from "next/server";

import { removeBrokenLink } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

type Body = {
  type?: "remove-broken-link";
  pageSlug?: string;
  brokenSlug?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (body.type !== "remove-broken-link") {
    return NextResponse.json({ error: `unknown fix type: ${String(body.type)}` }, { status: 400 });
  }
  if (typeof body.pageSlug !== "string" || typeof body.brokenSlug !== "string") {
    return NextResponse.json({ error: "pageSlug and brokenSlug are required" }, { status: 400 });
  }

  const ctx = await openWikiContext();
  try {
    const result = await removeBrokenLink(ctx.wikiPath, ctx.db, body.pageSlug, body.brokenSlug);
    return NextResponse.json({
      ok: true,
      page: { slug: result.page.slug, content: result.page.content },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: `page not found: ${body.pageSlug}` }, { status: 404 });
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "fix failed" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}
