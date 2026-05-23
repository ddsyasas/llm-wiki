import { NextResponse } from "next/server";

import { createPage, listPageRows, PageAlreadyExistsError } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

const PAGE_TYPES = ["entity", "concept", "source", "comparison", "overview"] as const;
type PageType = (typeof PAGE_TYPES)[number];

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

type CreateBody = {
  slug?: string;
  title?: string;
  type?: PageType;
  content?: string;
  tags?: string[];
  sources?: string[];
};

const SLUG_RE = /^[a-z0-9-]+$/;

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.slug !== "string" || !SLUG_RE.test(body.slug)) {
    return NextResponse.json(
      { error: "slug must be kebab-case (lowercase, hyphens only)" },
      { status: 400 },
    );
  }
  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 });
  }
  if (typeof body.type !== "string" || !PAGE_TYPES.includes(body.type)) {
    return NextResponse.json(
      { error: `type must be one of: ${PAGE_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  const ctx = await openWikiContext();
  try {
    const page = await createPage(ctx.wikiPath, ctx.db, {
      slug: body.slug,
      title: body.title,
      type: body.type,
      content: body.content,
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.sources !== undefined ? { sources: body.sources } : {}),
    });
    return NextResponse.json({
      ok: true,
      slug: page.slug,
      page: {
        slug: page.slug,
        frontmatter: page.frontmatter,
        content: page.content,
      },
    });
  } catch (err) {
    if (err instanceof PageAlreadyExistsError) {
      return NextResponse.json(
        { error: `page already exists: ${err.slug}`, type: "PageAlreadyExistsError" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to create page" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}
