import { NextResponse } from "next/server";

import {
  DEFAULT_WIKI_SETTINGS,
  loadWikiSettings,
  saveWikiSettings,
  type WikiSettings,
} from "@llm-wiki/core";

import { resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export async function GET() {
  const wikiPath = resolveWikiPath();
  const settings = await loadWikiSettings(wikiPath);
  return NextResponse.json({ settings, wikiPath });
}

type PutBody = Partial<{
  topic: string;
  defaultModels: Partial<WikiSettings["defaultModels"]>;
  autoLintAfterIngest: boolean;
  showCostEstimates: boolean;
}>;

export async function PUT(req: Request) {
  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const wikiPath = resolveWikiPath();
  const current = await loadWikiSettings(wikiPath);
  const next: WikiSettings = {
    version: 1,
    topic: typeof body.topic === "string" ? body.topic : current.topic,
    defaultModels: {
      ingest: body.defaultModels?.ingest ?? current.defaultModels.ingest,
      query: body.defaultModels?.query ?? current.defaultModels.query,
      chat: body.defaultModels?.chat ?? current.defaultModels.chat,
      lint: body.defaultModels?.lint ?? current.defaultModels.lint,
      vision: body.defaultModels?.vision ?? current.defaultModels.vision,
    },
    autoLintAfterIngest:
      typeof body.autoLintAfterIngest === "boolean"
        ? body.autoLintAfterIngest
        : current.autoLintAfterIngest,
    showCostEstimates:
      typeof body.showCostEstimates === "boolean"
        ? body.showCostEstimates
        : current.showCostEstimates,
  };
  await saveWikiSettings(wikiPath, next);
  // Return both the saved settings and the model defaults for the UI's
  // "reset to default" affordance.
  return NextResponse.json({ ok: true, settings: next, defaults: DEFAULT_WIKI_SETTINGS });
}
