import { NextResponse } from "next/server";

import { getApiKey, getChat, sendChatMessage } from "@llm-wiki/core";
import { createClient, ContextLengthError, RateLimitError, UnknownModelError } from "@llm-wiki/llm";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  message?: string;
  modelOverride?: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json({ error: "message must be a non-empty string" }, { status: 400 });
  }

  const { key } = await getApiKey();
  const ctx = await openWikiContext();
  try {
    if (!getChat(ctx.db, params.id)) {
      return NextResponse.json({ error: `chat not found: ${params.id}` }, { status: 404 });
    }
    const provider = ctx.settings.defaultModels.chat.provider;
    if (provider === "openrouter" && !key) {
      return NextResponse.json(
        { error: "OpenRouter API key not configured. Set one in Settings." },
        { status: 400 },
      );
    }
    const client = createClient(key || "", provider);
    const r = await sendChatMessage({
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      chatId: params.id,
      userMessage: body.message,
      client,
      ...(body.modelOverride ? { modelOverride: body.modelOverride } : {}),
    });
    return NextResponse.json({
      ok: true,
      chat: r.row,
      user: r.user,
      assistant: r.assistant,
      modelUsed: r.modelUsed,
      providerUsed: provider,
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
        error: (err as Error).message ?? "send failed",
        type: (err as Error).name ?? "Error",
      },
      { status },
    );
  } finally {
    ctx.db.close();
  }
}
