import { NextResponse } from "next/server";

import { getApiKey, queryWiki } from "@llm-wiki/core";
import { createClient, ContextLengthError, RateLimitError, UnknownModelError } from "@llm-wiki/llm";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type QueryBody = {
  question?: string;
  model?: string;
};

export async function POST(req: Request) {
  let body: QueryBody;
  try {
    body = (await req.json()) as QueryBody;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.question !== "string" || body.question.trim().length === 0) {
    return NextResponse.json({ error: "question must be a non-empty string" }, { status: 400 });
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
  const model = body.model ?? ctx.settings.defaultModels.query;

  try {
    const response = await queryWiki({
      question: body.question,
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      client,
      model,
    });
    return NextResponse.json({ ok: true, model, response });
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
        error: (err as Error).message ?? "query failed",
        type: (err as Error).name ?? "Error",
      },
      { status },
    );
  } finally {
    ctx.db.close();
  }
}
