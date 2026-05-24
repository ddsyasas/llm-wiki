import { extname } from "node:path";

import { NextResponse } from "next/server";

import {
  getApiKey,
  ingestPastedText,
  ingestSource,
  ingestVisionSource,
  markSourceIngested,
  saveRawSource,
  type IngestResponse,
} from "@llm-wiki/core";
import {
  detectFormat,
  detectFormatFromUrl,
  extractDocx,
  extractHtml,
  extractImage,
  extractMarkdown,
  extractPdf,
  extractPlain,
  extractPptx,
  extractXlsx,
  fetchAndExtractUrl,
  type ExtractedSource,
} from "@llm-wiki/ingestion";
import { createClient, ContextLengthError, RateLimitError, UnknownModelError } from "@llm-wiki/llm";

import { openWikiContext, resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
// Vision calls (large PDFs/images) can take 60s+; raise from default 10s.
export const maxDuration = 180;

type IngestJsonBody = {
  text?: string;
  url?: string;
  title?: string;
  model?: string;
};

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  const { key } = await getApiKey();
  if (!key) {
    return NextResponse.json(
      { error: "OpenRouter API key not configured. Set one in Settings." },
      { status: 400 },
    );
  }

  try {
    if (contentType.startsWith("multipart/form-data")) {
      return await handleFileUpload(req, key);
    }
    // Default: JSON body (pasted text or URL).
    let body: IngestJsonBody;
    try {
      body = (await req.json()) as IngestJsonBody;
    } catch {
      return NextResponse.json({ error: "expected JSON body or multipart upload" }, { status: 400 });
    }
    if (typeof body.url === "string" && body.url.trim()) {
      return await handleUrl(body.url.trim(), body.title, body.model, key);
    }
    if (typeof body.text === "string" && body.text.trim()) {
      return await handleText(body.text, body.title, body.model, key);
    }
    return NextResponse.json(
      { error: "request must include `text`, `url`, or a multipart `file`" },
      { status: 400 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// ---- handlers -------------------------------------------------------------

async function handleText(
  text: string,
  title: string | undefined,
  modelOverride: string | undefined,
  apiKey: string,
): Promise<Response> {
  const ctx = await openWikiContext();
  const client = createClient(apiKey);
  const model = modelOverride ?? ctx.settings.defaultModels.ingest;
  const dryRun = ctx.settings.requireApprovalForIngest;
  try {
    const result = await ingestPastedText({
      text,
      ...(title ? { title } : {}),
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      client,
      model,
      dryRun,
    });
    return ingestSuccess({
      wikiPath: resolveWikiPath(),
      sourceId: result.sourceId,
      rawFilename: result.rawFilename,
      model,
      response: result.response,
      kind: dryRun ? "preview" : "applied",
    });
  } finally {
    ctx.db.close();
  }
}

async function handleUrl(
  url: string,
  titleOverride: string | undefined,
  modelOverride: string | undefined,
  apiKey: string,
): Promise<Response> {
  // Extract first (outside DB context) so failures don't leave dangling state.
  let extracted;
  try {
    extracted = await fetchAndExtractUrl(url);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "URL fetch failed", type: "FetchError" },
      { status: 400 },
    );
  }
  const title = titleOverride?.trim() || extracted.title;

  const ctx = await openWikiContext();
  const client = createClient(apiKey);
  const model = modelOverride ?? ctx.settings.defaultModels.ingest;
  const dryRun = ctx.settings.requireApprovalForIngest;
  try {
    const saved = await saveRawSource({
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      buffer: Buffer.from(extracted.content, "utf8"),
      ext: ".md",
      format: "url",
      title,
      url,
    });
    const response = await ingestSource({
      source: { content: extracted.content, title, format: "url" },
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      client,
      model,
      sourceId: saved.sourceId,
      dryRun,
    });
    if (!dryRun) markSourceIngested(ctx.db, saved.sourceId);
    return ingestSuccess({
      wikiPath: resolveWikiPath(),
      sourceId: saved.sourceId,
      rawFilename: saved.rawFilename,
      model,
      kind: dryRun ? "preview" : "applied",
      response,
    });
  } finally {
    ctx.db.close();
  }
}

async function handleFileUpload(req: Request, apiKey: string): Promise<Response> {
  const form = await req.formData();
  const file = form.get("file");
  const titleOverride = (form.get("title") as string | null) ?? undefined;
  const modelOverride = (form.get("model") as string | null) ?? undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing `file` field in multipart body" }, { status: 400 });
  }

  const filename = file.name || "upload";
  const buffer = Buffer.from(await file.arrayBuffer());
  const format = detectFormat(filename, buffer);

  let extracted: ExtractedSource;
  try {
    extracted = await runExtractor(format, buffer, filename);
  } catch (err) {
    return NextResponse.json(
      { error: `extraction failed for ${format}: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const title = titleOverride?.trim() || extracted.title;
  if ("title" in extracted) extracted.title = title;

  const ctx = await openWikiContext();
  const client = createClient(apiKey);
  const visionModel = modelOverride ?? ctx.settings.defaultModels.vision;
  const textModel = modelOverride ?? ctx.settings.defaultModels.ingest;
  const dryRun = ctx.settings.requireApprovalForIngest;

  try {
    const ext = extname(filename) || `.${format}`;
    const saved = await saveRawSource({
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      buffer,
      ext,
      format,
      title,
      originalName: filename,
    });

    let response: IngestResponse;
    let modelUsed: string;
    if (extracted.kind === "vision") {
      modelUsed = visionModel;
      response = await ingestVisionSource({
        source: extracted,
        wikiPath: ctx.wikiPath,
        db: ctx.db,
        client,
        model: visionModel,
        sourceId: saved.sourceId,
        dryRun,
      });
    } else {
      modelUsed = textModel;
      response = await ingestSource({
        source: { content: extracted.content, title, format },
        wikiPath: ctx.wikiPath,
        db: ctx.db,
        client,
        model: textModel,
        sourceId: saved.sourceId,
        dryRun,
      });
    }
    if (!dryRun) markSourceIngested(ctx.db, saved.sourceId);
    return ingestSuccess({
      wikiPath: resolveWikiPath(),
      sourceId: saved.sourceId,
      rawFilename: saved.rawFilename,
      model: modelUsed,
      response,
      kind: dryRun ? "preview" : "applied",
    });
  } finally {
    ctx.db.close();
  }
}

// ---- helpers --------------------------------------------------------------

async function runExtractor(
  format: ReturnType<typeof detectFormat>,
  buffer: Buffer,
  filename: string,
): Promise<ExtractedSource> {
  switch (format) {
    case "md":
      return extractMarkdown(buffer, filename);
    case "txt":
      return extractPlain(buffer, filename);
    case "html":
      return extractHtml(buffer);
    case "url":
      // URL detection only happens via URL string, not via uploaded file.
      // If we somehow get here, fall back to HTML.
      return extractHtml(buffer);
    case "docx":
      return extractDocx(buffer, filename);
    case "pptx":
      return extractPptx(buffer, filename);
    case "xlsx":
      return extractXlsx(buffer, filename);
    case "pdf":
      return extractPdf(buffer, filename);
    case "image":
      return extractImage(buffer, filename);
    default: {
      // Exhaustiveness check.
      const _exhaustive: never = format;
      void _exhaustive;
      throw new Error(`unsupported format: ${String(format)}`);
    }
  }
}

function ingestSuccess(args: {
  wikiPath: string;
  sourceId: string;
  rawFilename: string;
  model: string;
  response: IngestResponse;
  kind: "applied" | "preview";
}) {
  return NextResponse.json({
    ok: true,
    kind: args.kind,
    wikiPath: args.wikiPath,
    sourceId: args.sourceId,
    rawFilename: args.rawFilename,
    model: args.model,
    // Short-form response (always returned) — drives the user-facing
    // summary UI. When kind === "preview", the client also reads
    // `fullResponse` below so it can re-send the proposal to
    // /api/ingest/apply unchanged.
    response: {
      summary: args.response.summary,
      newPages: args.response.newPages.map((p) => ({
        slug: p.slug,
        title: p.title,
        type: p.type,
      })),
      pageUpdates: args.response.pageUpdates.map((p) => ({
        slug: p.slug,
        updateReason: p.updateReason,
      })),
      contradictions: args.response.contradictions,
    },
    fullResponse: args.kind === "preview" ? args.response : null,
  });
}

function errorResponse(err: unknown): Response {
  const status =
    err instanceof ContextLengthError || err instanceof UnknownModelError
      ? 400
      : err instanceof RateLimitError
        ? 429
        : 500;
  return NextResponse.json(
    {
      ok: false,
      error: (err as Error).message ?? "ingest failed",
      type: (err as Error).name ?? "Error",
    },
    { status },
  );
}

// Tell Next.js this is a JS-only route; no caching, no static export.
export {};
