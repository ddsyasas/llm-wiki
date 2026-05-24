import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { getSource, WIKI_PATHS } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// Cap how much raw text we send back — most sources are well under this,
// but a paste-bomb shouldn't lock the browser.
const MAX_RAW_BYTES = 1_000_000; // 1 MB

// GET /api/sources/[id] — full source row plus the raw file body if it's
// text. Binary formats (pdf, image) return rawText: null + a hint string
// so the UI can show "open this in your editor" instead of garbage.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await openWikiContext();
  try {
    const source = getSource(ctx.db, params.id);
    if (!source) {
      return NextResponse.json({ error: `source not found: ${params.id}` }, { status: 404 });
    }

    const rawPath = join(ctx.wikiPath, WIKI_PATHS.raw, source.filename);
    let rawText: string | null = null;
    let rawError: string | null = null;
    let truncated = false;

    try {
      const buf = await readFile(rawPath);
      if (buf.length > MAX_RAW_BYTES) {
        rawText = buf.subarray(0, MAX_RAW_BYTES).toString("utf8");
        truncated = true;
      } else {
        rawText = buf.toString("utf8");
      }
      // Quick binary sniff: utf8 text with replacement chars is probably binary.
      if (rawText.includes("�")) {
        rawText = null;
        rawError = "Binary file — open in an editor that handles this format.";
      }
    } catch (err) {
      rawError = (err as Error).message ?? "failed to read raw file";
    }

    return NextResponse.json({
      source: {
        id: source.id,
        filename: source.filename,
        originalName: source.original_name,
        format: source.format,
        sizeBytes: source.size_bytes,
        addedAt: source.added_at,
        ingestedAt: source.ingested_at,
        url: source.url,
        title: source.title,
      },
      rawText,
      rawError,
      truncated,
      rawPath,
    });
  } finally {
    ctx.db.close();
  }
}
