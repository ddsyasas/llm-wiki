import { NextResponse } from "next/server";

import {
  deleteChat,
  getChat,
  moveChat,
  pinChat,
  readChat,
  renameChat,
} from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

type RouteParams = { params: { id: string } };

export async function GET(_req: Request, { params }: RouteParams) {
  const ctx = await openWikiContext();
  try {
    if (!getChat(ctx.db, params.id)) {
      return NextResponse.json({ error: `chat not found: ${params.id}` }, { status: 404 });
    }
    const chat = await readChat(ctx.wikiPath, params.id, ctx.db);
    return NextResponse.json(chat);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to read chat" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}

type PatchBody = {
  title?: string;
  folder?: string;
  pinned?: boolean;
};

export async function PATCH(req: Request, { params }: RouteParams) {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const ctx = await openWikiContext();
  try {
    let row = getChat(ctx.db, params.id);
    if (!row) {
      return NextResponse.json({ error: `chat not found: ${params.id}` }, { status: 404 });
    }
    if (typeof body.title === "string") {
      row = await renameChat(ctx.wikiPath, ctx.db, params.id, body.title);
    }
    if (typeof body.folder === "string") {
      row = await moveChat(ctx.wikiPath, ctx.db, params.id, body.folder);
    }
    if (typeof body.pinned === "boolean") {
      row = await pinChat(ctx.wikiPath, ctx.db, params.id, body.pinned);
    }
    return NextResponse.json({ ok: true, chat: row });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to update chat" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const ctx = await openWikiContext();
  try {
    if (!getChat(ctx.db, params.id)) {
      return NextResponse.json({ error: `chat not found: ${params.id}` }, { status: 404 });
    }
    const r = await deleteChat(ctx.wikiPath, ctx.db, params.id);
    return NextResponse.json({ ok: true, trashedPath: r.trashedPath });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to delete chat" },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}
