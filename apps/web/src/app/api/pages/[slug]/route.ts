import { NextResponse } from "next/server";

import { applyManualEdit, readPage } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

type RouteParams = { params: { slug: string } };

export async function GET(_req: Request, { params }: RouteParams) {
  const ctx = await openWikiContext();
  try {
    const page = await readPage(ctx.wikiPath, params.slug);
    return NextResponse.json({
      slug: page.slug,
      frontmatter: page.frontmatter,
      content: page.content,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: `page not found: ${params.slug}` }, { status: 404 });
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to read page" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}

type EditBody = {
  content?: string;
  title?: string;
  type?: "entity" | "concept" | "source" | "comparison" | "overview";
  tags?: string[];
};

export async function PUT(req: Request, { params }: RouteParams) {
  let body: EditBody;
  try {
    body = (await req.json()) as EditBody;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  const ctx = await openWikiContext();
  try {
    const result = await applyManualEdit(ctx.wikiPath, ctx.db, params.slug, {
      content: body.content,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
    });
    return NextResponse.json({
      ok: true,
      slug: result.slug,
      page: {
        slug: result.page.slug,
        frontmatter: result.page.frontmatter,
        content: result.page.content,
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: `page not found: ${params.slug}` }, { status: 404 });
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to save page" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}
