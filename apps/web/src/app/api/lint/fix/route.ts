import { NextResponse } from "next/server";

import {
  applyLintSuggestedFix,
  createStubPage,
  findBacklinks,
  getApiKey,
  getPage,
  PageAlreadyExistsError,
  rebuildIndexFromPages,
  removeBrokenLink,
} from "@llm-wiki/core";
import { createClient, ContextLengthError, RateLimitError, UnknownModelError } from "@llm-wiki/llm";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
// LLM-powered fixes can take ~10s; give them room.
export const maxDuration = 60;

type FixBody =
  | { type: "remove-broken-link"; pageSlug: string; brokenSlug: string }
  | { type: "rebuild-index" }
  | {
      type: "fix-all-broken-links";
      items: Array<{ pageSlug: string; brokenSlug: string }>;
    }
  | { type: "create-stub-page"; missingSlug: string }
  | {
      type: "apply-suggested-fix";
      pageSlug: string;
      issueDescription: string;
      fixInstruction: string;
    };

export async function POST(req: Request) {
  let body: FixBody;
  try {
    body = (await req.json()) as FixBody;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const ctx = await openWikiContext();
  try {
    switch (body.type) {
      case "remove-broken-link":
        return await handleRemoveBrokenLink(ctx, body);
      case "rebuild-index":
        return await handleRebuildIndex(ctx);
      case "fix-all-broken-links":
        return await handleFixAllBrokenLinks(ctx, body);
      case "create-stub-page":
        return await handleCreateStubPage(ctx, body);
      case "apply-suggested-fix":
        return await handleApplySuggestedFix(ctx, body);
      default:
        return NextResponse.json(
          { error: `unknown fix type: ${String((body as { type?: string }).type)}` },
          { status: 400 },
        );
    }
  } finally {
    ctx.db.close();
  }
}

// ---- handlers -------------------------------------------------------------

type Ctx = Awaited<ReturnType<typeof openWikiContext>>;

async function handleRemoveBrokenLink(
  ctx: Ctx,
  body: Extract<FixBody, { type: "remove-broken-link" }>,
): Promise<Response> {
  if (typeof body.pageSlug !== "string" || typeof body.brokenSlug !== "string") {
    return NextResponse.json(
      { error: "pageSlug and brokenSlug are required" },
      { status: 400 },
    );
  }
  try {
    const result = await removeBrokenLink(
      ctx.wikiPath,
      ctx.db,
      body.pageSlug,
      body.brokenSlug,
    );
    return NextResponse.json({
      ok: true,
      page: { slug: result.page.slug, content: result.page.content },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(
        { error: `page not found: ${body.pageSlug}` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: (err as Error).message ?? "fix failed" },
      { status: 500 },
    );
  }
}

async function handleRebuildIndex(ctx: Ctx): Promise<Response> {
  try {
    const result = await rebuildIndexFromPages(ctx.wikiPath, ctx.db);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "rebuild failed" },
      { status: 500 },
    );
  }
}

async function handleFixAllBrokenLinks(
  ctx: Ctx,
  body: Extract<FixBody, { type: "fix-all-broken-links" }>,
): Promise<Response> {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }
  const fixed: Array<{ pageSlug: string; brokenSlug: string }> = [];
  const failed: Array<{ pageSlug: string; brokenSlug: string; error: string }> = [];
  for (const item of body.items) {
    try {
      await removeBrokenLink(ctx.wikiPath, ctx.db, item.pageSlug, item.brokenSlug);
      fixed.push(item);
    } catch (err) {
      failed.push({ ...item, error: (err as Error).message ?? "unknown" });
    }
  }
  return NextResponse.json({ ok: true, fixed, failed });
}

async function handleCreateStubPage(
  ctx: Ctx,
  body: Extract<FixBody, { type: "create-stub-page" }>,
): Promise<Response> {
  if (typeof body.missingSlug !== "string" || body.missingSlug.length === 0) {
    return NextResponse.json({ error: "missingSlug is required" }, { status: 400 });
  }

  // If the slug already has a page on disk, the issue is really "missing from
  // index" — just rebuild and tell the UI we didn't need the LLM.
  const existing = getPage(ctx.db, body.missingSlug);
  if (existing) {
    const result = await rebuildIndexFromPages(ctx.wikiPath, ctx.db);
    return NextResponse.json({
      ok: true,
      kind: "index-rebuilt",
      message: `Page already exists. Rebuilt index; ${result.added.length} entry(ies) added.`,
      slug: body.missingSlug,
    });
  }

  const { key } = await getApiKey();
  const provider = ctx.settings.defaultModels.ingest.provider;
  if (provider === "openrouter" && !key) {
    return NextResponse.json(
      { error: "OpenRouter API key not configured. Set one in Settings." },
      { status: 400 },
    );
  }
  const client = createClient(key || "", provider);
  const model = ctx.settings.defaultModels.ingest.model;

  // Gather the existing pages that reference the missing slug — gives the
  // LLM concrete context so the stub fits the wiki's voice.
  const backlinks = await findBacklinks(ctx.db, ctx.wikiPath, body.missingSlug);
  const referencingPages = backlinks.map((b) => ({
    slug: b.slug,
    title: b.title,
    excerpt: b.excerpt,
  }));

  try {
    const result = await createStubPage({
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      client,
      model,
      missingSlug: body.missingSlug,
      referencingPages,
    });
    return NextResponse.json({
      ok: true,
      kind: "stub-created",
      slug: result.page.slug,
      title: result.page.frontmatter.title,
      type: result.page.frontmatter.type,
      model: result.modelUsed,
    });
  } catch (err) {
    return llmErrorResponse(err);
  }
}

async function handleApplySuggestedFix(
  ctx: Ctx,
  body: Extract<FixBody, { type: "apply-suggested-fix" }>,
): Promise<Response> {
  if (
    typeof body.pageSlug !== "string" ||
    typeof body.issueDescription !== "string" ||
    typeof body.fixInstruction !== "string"
  ) {
    return NextResponse.json(
      { error: "pageSlug, issueDescription, and fixInstruction are required" },
      { status: 400 },
    );
  }
  const { key } = await getApiKey();
  const provider = ctx.settings.defaultModels.lint.provider;
  if (provider === "openrouter" && !key) {
    return NextResponse.json(
      { error: "OpenRouter API key not configured. Set one in Settings." },
      { status: 400 },
    );
  }
  const client = createClient(key || "", provider);
  const model = ctx.settings.defaultModels.lint.model;

  try {
    const result = await applyLintSuggestedFix({
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      client,
      model,
      pageSlug: body.pageSlug,
      issueDescription: body.issueDescription,
      fixInstruction: body.fixInstruction,
    });
    return NextResponse.json({
      ok: true,
      kind: result.noop ? "fix-noop" : "fix-applied",
      slug: body.pageSlug,
      changeSummary: result.changeSummary,
      model: result.modelUsed,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: `page not found: ${body.pageSlug}` }, { status: 404 });
    }
    return llmErrorResponse(err);
  }
}

function llmErrorResponse(err: unknown): Response {
  if (err instanceof PageAlreadyExistsError) {
    return NextResponse.json(
      { error: `page already exists: ${err.slug}` },
      { status: 409 },
    );
  }
  const status =
    err instanceof ContextLengthError || err instanceof UnknownModelError
      ? 400
      : err instanceof RateLimitError
        ? 429
        : 500;
  return NextResponse.json(
    {
      error: (err as Error).message ?? "fix failed",
      type: (err as Error).name ?? "Error",
    },
    { status },
  );
}
