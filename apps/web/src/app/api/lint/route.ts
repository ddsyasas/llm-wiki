import { NextResponse } from "next/server";

import { getApiKey, lintWiki } from "@llm-wiki/core";
import { createClient, ContextLengthError, RateLimitError, UnknownModelError } from "@llm-wiki/llm";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Body = { model?: string };

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
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
  const model = body.model ?? ctx.settings.defaultModels.lint;

  try {
    const result = await lintWiki({
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      client,
      model,
    });
    return NextResponse.json({ ok: true, model, result });
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
        error: (err as Error).message ?? "lint failed",
        type: (err as Error).name ?? "Error",
      },
      { status },
    );
  } finally {
    ctx.db.close();
  }
}
