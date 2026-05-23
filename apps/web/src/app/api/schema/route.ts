import { NextResponse } from "next/server";

import { readSchema, saveSchema } from "@llm-wiki/core";

import { resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export async function GET() {
  const wikiPath = resolveWikiPath();
  let content: string;
  try {
    content = await readSchema(wikiPath);
  } catch {
    content = "";
  }
  return NextResponse.json({ content, wikiPath });
}

type PutBody = { content?: string };

export async function PUT(req: Request) {
  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }
  const wikiPath = resolveWikiPath();
  try {
    const result = await saveSchema(wikiPath, body.content);
    return NextResponse.json({
      ok: true,
      backupPath: result.backupPath,
      prunedCount: result.prunedCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "save failed" },
      { status: 500 },
    );
  }
}
