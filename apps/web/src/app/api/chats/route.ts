import { NextResponse } from "next/server";

import { createChat, listChats } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const folder = url.searchParams.get("folder") ?? undefined;
  const ctx = await openWikiContext();
  try {
    const rows = listChats(ctx.db, folder ?? undefined);
    return NextResponse.json({ chats: rows, wikiPath: ctx.wikiPath });
  } finally {
    ctx.db.close();
  }
}

type CreateBody = {
  folder?: string;
  title?: string;
  model?: string;
  tags?: string[];
};

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    body = {};
  }
  const ctx = await openWikiContext();
  try {
    const row = await createChat(ctx.wikiPath, ctx.db, {
      ...(body.folder ? { folder: body.folder } : {}),
      ...(body.title ? { title: body.title } : {}),
      model: body.model ?? ctx.settings.defaultModels.query,
      ...(body.tags ? { tags: body.tags } : {}),
    });
    return NextResponse.json({ ok: true, chat: row });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to create chat" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}
