import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import {
  getApiKey,
  getSource,
  ingestSource,
  markSourceIngested,
  WIKI_PATHS,
  type IngestResponse,
} from "@llm-wiki/core";
import { createClient, ContextLengthError, RateLimitError, UnknownModelError } from "@llm-wiki/llm";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// POST /api/sources/[id]/retry — re-runs the ingest pipeline on an existing
// source whose raw file is still on disk. Useful when the original ingest
// failed (LLM schema validation drift, transient network error, etc.) and
// the source row sits as "pending" in the picker.
//
// Body: { modelOverride?: string } — optional, defaults to the wiki's
// configured ingest model. Useful when the user wants to retry on a smarter
// model after the original cheap-model attempt failed.
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let body: { modelOverride?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { modelOverride?: string };
  } catch {
    // Optional body — empty is fine
  }

  const { key } = await getApiKey();

  const ctx = await openWikiContext();
  try {
    const provider = ctx.settings.defaultModels.ingest.provider;
    if (provider === "openrouter" && !key) {
      ctx.db.close();
      return NextResponse.json(
        { error: "OpenRouter API key not configured. Set one in Settings." },
        { status: 400 },
      );
    }

    const source = getSource(ctx.db, params.id);
    if (!source) {
      return NextResponse.json(
        { error: `source not found: ${params.id}` },
        { status: 404 },
      );
    }

    const rawPath = join(ctx.wikiPath, WIKI_PATHS.raw, source.filename);
    let rawContent: string;
    try {
      rawContent = await readFile(rawPath, "utf8");
    } catch (err) {
      return NextResponse.json(
        {
          error: `raw file missing at ${rawPath} — this source can't be retried, only deleted`,
          type: (err as Error).name,
        },
        { status: 404 },
      );
    }

    const client = createClient(key || "", provider);
    const model = body.modelOverride ?? ctx.settings.defaultModels.ingest.model;
    const title = source.title?.trim() || source.original_name || source.filename;

    let response: IngestResponse;
    try {
      response = await ingestSource({
        source: { content: rawContent, title, format: source.format },
        wikiPath: ctx.wikiPath,
        db: ctx.db,
        client,
        model,
        sourceId: source.id,
      });
    } catch (err) {
      const status =
        err instanceof ContextLengthError || err instanceof UnknownModelError
          ? 400
          : err instanceof RateLimitError
            ? 429
            : 500;
      return NextResponse.json(
        {
          ok: false,
          error: (err as Error).message ?? "ingest failed",
          type: (err as Error).name ?? "Error",
        },
        { status },
      );
    }

    markSourceIngested(ctx.db, source.id);

    return NextResponse.json({
      ok: true,
      sourceId: source.id,
      model,
      modelUsed: model,
      providerUsed: provider,
      response: {
        summary: response.summary,
        newPages: response.newPages.map((p) => ({
          slug: p.slug,
          title: p.title,
          type: p.type,
        })),
        pageUpdates: response.pageUpdates.map((p) => ({
          slug: p.slug,
          updateReason: p.updateReason,
        })),
        contradictions: response.contradictions,
      },
    });
  } finally {
    ctx.db.close();
  }
}
