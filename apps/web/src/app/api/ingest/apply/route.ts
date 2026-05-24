import { NextResponse } from "next/server";

import {
  applyIngestResponse,
  getSource,
  markSourceIngested,
} from "@llm-wiki/core";
import { IngestResponseSchema } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ingest/apply — second half of the approval-gate flow.
//
// Body: { sourceId: string, response: IngestResponse }
//
// When settings.requireApprovalForIngest is on, the /api/ingest call
// returns kind: "preview" with the LLM's proposed changes but doesn't
// write anything. The user reviews on /sources and clicks Apply, which
// hits this endpoint with the same proposal. We re-validate the response
// against the zod schema (defense against a tampered round-trip) then
// run the standard applyIngestResponse + mark the source ingested.
//
// Doesn't make a fresh LLM call. The proposal here IS the one the user
// just looked at — applying it should be deterministic.
export async function POST(req: Request) {
  let body: { sourceId?: string; response?: unknown };
  try {
    body = (await req.json()) as { sourceId?: string; response?: unknown };
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.sourceId !== "string" || body.sourceId.length === 0) {
    return NextResponse.json(
      { error: "sourceId is required" },
      { status: 400 },
    );
  }

  const parsed = IngestResponseSchema.safeParse(body.response);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "response failed schema validation",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const ctx = await openWikiContext();
  try {
    const source = getSource(ctx.db, body.sourceId);
    if (!source) {
      return NextResponse.json(
        { error: `source not found: ${body.sourceId}` },
        { status: 404 },
      );
    }

    await applyIngestResponse({
      response: parsed.data,
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      sourceId: source.id,
      sourceTitle: source.title ?? source.original_name ?? source.filename,
      format: source.format,
    });
    markSourceIngested(ctx.db, source.id);

    return NextResponse.json({
      ok: true,
      sourceId: source.id,
      response: {
        newPages: parsed.data.newPages.map((p) => ({
          slug: p.slug,
          title: p.title,
          type: p.type,
        })),
        pageUpdates: parsed.data.pageUpdates.map((p) => ({
          slug: p.slug,
          updateReason: p.updateReason,
        })),
        contradictions: parsed.data.contradictions,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message ?? "apply failed",
        type: (err as Error).name ?? "Error",
      },
      { status: 500 },
    );
  } finally {
    ctx.db.close();
  }
}
