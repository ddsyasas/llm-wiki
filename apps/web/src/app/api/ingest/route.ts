import { NextResponse } from "next/server";

import { getApiKey, ingestPastedText } from "@llm-wiki/core";
import { createClient, ContextLengthError, RateLimitError, UnknownModelError } from "@llm-wiki/llm";

import { openWikiContext, resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
// Ingest LLM calls can take 30+ seconds with longer sources; raise the
// route timeout so the function isn't killed mid-call.
export const maxDuration = 120;

type IngestRequest = {
  text?: string;
  title?: string;
  model?: string;
};

export async function POST(req: Request) {
  let body: IngestRequest = {};
  try {
    body = (await req.json()) as IngestRequest;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const text = body.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
  }

  const { key } = await getApiKey();
  if (!key) {
    return NextResponse.json(
      { error: "OpenRouter API key not configured. Set one in Settings." },
      { status: 400 },
    );
  }

  const ctx = await openWikiContext();
  const client = createClient(key);
  const model = body.model ?? ctx.settings.defaultModels.ingest;

  try {
    const result = await ingestPastedText({
      text,
      ...(body.title ? { title: body.title } : {}),
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      client,
      model,
    });

    return NextResponse.json({
      ok: true,
      wikiPath: resolveWikiPath(),
      sourceId: result.sourceId,
      rawFilename: result.rawFilename,
      model,
      response: {
        summary: result.response.summary,
        newPages: result.response.newPages.map((p) => ({ slug: p.slug, title: p.title, type: p.type })),
        pageUpdates: result.response.pageUpdates.map((p) => ({ slug: p.slug, updateReason: p.updateReason })),
        contradictions: result.response.contradictions,
      },
    });
  } catch (err) {
    const status = err instanceof ContextLengthError || err instanceof UnknownModelError ? 400
      : err instanceof RateLimitError ? 429
      : 500;
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message ?? "ingest failed",
        type: (err as Error).name ?? "Error",
      },
      { status },
    );
  } finally {
    ctx.db.close();
  }
}
