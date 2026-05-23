import { NextResponse } from "next/server";

import { listChatFolders } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await openWikiContext();
  try {
    const folders = await listChatFolders(ctx.wikiPath);
    return NextResponse.json({ folders });
  } finally {
    ctx.db.close();
  }
}
