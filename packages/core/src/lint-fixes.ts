// LLM-powered lint quick-fixes. Local fixes (remove-broken-link,
// rebuild-index) live in editor.ts and index-builder.ts respectively.
//
// These two operate on a single issue at a time. Cost per click is roughly
// a query call — small. The LLM is asked for tight, structured output so the
// page goes straight onto disk without further review.

import { z } from "zod";

import { callLLM, type LlmClient } from "@llm-wiki/llm";

import type { Db } from "./db";
import { insertUsage } from "./db-usage";
import { applyManualEdit, createPage, type ManualEditResult } from "./editor";
import { rebuildIndexFromPages } from "./index-builder";
import { PAGE_TYPES, type Page, type PageType } from "./types";
import { readIndex, readPage, readSchema } from "./wiki";

// ---- create stub page -----------------------------------------------------

const CreateStubResponseSchema = z.object({
  title: z.string().min(1),
  type: z.enum(PAGE_TYPES as readonly [PageType, ...PageType[]]),
  // The stub itself. Should reference the existing context pages with
  // [[wikilinks]] so the new page isn't orphaned the moment it lands.
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export type CreateStubPageContext = {
  /** A page already in the wiki that references the missing slug. */
  slug: string;
  title: string;
  /** A snippet of that page's content showing how the slug is mentioned. */
  excerpt: string;
};

export type CreateStubPageOptions = {
  wikiPath: string;
  db: Db;
  client: LlmClient;
  model: string;
  /** The slug the lint pass said was missing. */
  missingSlug: string;
  /** Pages that already reference the missing slug — passed as context. */
  referencingPages: ReadonlyArray<CreateStubPageContext>;
};

export type CreateStubPageResult = {
  page: Page;
  modelUsed: string;
};

const STUB_PAGE_SYSTEM = `You write a brand-new wiki page to fill a gap in an LLM Wiki.

Rules:
- Output ONLY a JSON object matching the schema. No preamble, no markdown fences.
- Slug is fixed by the caller — DO NOT invent a different one.
- Pick the correct \`type\`: entity (person, org, place), concept (idea, technique, framework, theorem), source (a single document summary), comparison (two or more things contrasted), overview (high-level synthesis).
- Keep the page concise — this is a stub. ~50-150 words of body. The user will expand it later.
- Cross-link with [[slug]] notation to pages that referenced this stub, so it's not orphaned.
- Don't fabricate detailed facts you can't ground in the context excerpts. If a fact isn't in the context, state it generically or leave it out.
- Be honest about uncertainty in a brief opening sentence.

JSON_SHAPE:
{
  "title": "Human-readable title (e.g. 'No-Cloning Theorem')",
  "type": "concept",
  "content": "Markdown body. Open with one sentence defining the topic, then 2-3 short paragraphs or a short list. Use [[other-slug]] cross-links.",
  "tags": ["string", "tags"]
}`;

function formatReferencingContext(
  missingSlug: string,
  pages: ReadonlyArray<CreateStubPageContext>,
): string {
  if (pages.length === 0) {
    return `No existing pages reference [[${missingSlug}]] yet. Use your general knowledge to write a brief, honest stub.`;
  }
  const lines = [
    `[[${missingSlug}]] is referenced from the following pages. Use these excerpts to write a stub that fits the wiki's existing voice and links back to them.`,
    "",
  ];
  for (const p of pages) {
    lines.push(`### ${p.title} ([[${p.slug}]])`);
    lines.push(p.excerpt.trim());
    lines.push("");
  }
  return lines.join("\n");
}

export async function createStubPage(
  opts: CreateStubPageOptions,
): Promise<CreateStubPageResult> {
  const [schema, index] = await Promise.all([
    readSchemaOrDefault(opts.wikiPath),
    readIndexOrDefault(opts.wikiPath),
  ]);

  const user = [
    `Wiki schema (CLAUDE.md):`,
    schema,
    "",
    `Current wiki index:`,
    index,
    "",
    `Create a stub page with slug: ${opts.missingSlug}`,
    "",
    formatReferencingContext(opts.missingSlug, opts.referencingPages),
  ].join("\n");

  const result = await callLLM({
    client: opts.client,
    model: opts.model,
    system: STUB_PAGE_SYSTEM,
    user,
    schema: CreateStubResponseSchema,
  });

  insertUsage(opts.db, {
    operation: "lint",
    model: result.model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  const page = await createPage(opts.wikiPath, opts.db, {
    slug: opts.missingSlug,
    title: result.data.title,
    type: result.data.type,
    content: result.data.content,
    tags: result.data.tags,
  });

  // Rebuild the index now that a new page exists. Local-only, cheap.
  await rebuildIndexFromPages(opts.wikiPath, opts.db);

  return { page, modelUsed: result.model };
}

// ---- apply LLM-suggested fix ---------------------------------------------

const ApplyFixResponseSchema = z.object({
  // Full replacement content for the page body (no frontmatter). The LLM is
  // told to preserve the page's voice and any [[wikilinks]] not affected by
  // the fix.
  newContent: z.string().min(1),
  changeSummary: z.string().min(1),
});

export type ApplyLintFixOptions = {
  wikiPath: string;
  db: Db;
  client: LlmClient;
  model: string;
  pageSlug: string;
  /** The issue's `description` field from the lint result. */
  issueDescription: string;
  /** The issue's `suggestedFix` field from the lint result. */
  fixInstruction: string;
};

export type ApplyLintFixResult = {
  edit: ManualEditResult;
  modelUsed: string;
  changeSummary: string;
};

const APPLY_FIX_SYSTEM = `You apply a lint fix to a wiki page.

You are given a page's current body, a description of the issue, and a proposed fix. Apply the fix and return the page body's NEW content. Keep everything else identical — only change what the fix requires.

Rules:
- Output ONLY a JSON object matching the schema. No preamble, no markdown fences.
- Preserve every [[wikilink]] in the page unless the fix explicitly removes one.
- Preserve the page's voice and structure (headings, lists, paragraphs).
- The fix is usually one or two sentences of change. Don't rewrite the whole page.
- If the fix is impossible without losing important content, return the original content unchanged and explain in changeSummary.

JSON_SHAPE:
{
  "newContent": "Full page body, with the fix applied. Markdown only — no frontmatter.",
  "changeSummary": "One sentence describing what changed."
}`;

export async function applyLintSuggestedFix(
  opts: ApplyLintFixOptions,
): Promise<ApplyLintFixResult> {
  const page = await readPage(opts.wikiPath, opts.pageSlug);

  const user = [
    `Page slug: ${opts.pageSlug}`,
    `Page title: ${page.frontmatter.title}`,
    "",
    `Issue: ${opts.issueDescription}`,
    `Proposed fix: ${opts.fixInstruction}`,
    "",
    `Current page body:`,
    page.content,
  ].join("\n");

  const result = await callLLM({
    client: opts.client,
    model: opts.model,
    system: APPLY_FIX_SYSTEM,
    user,
    schema: ApplyFixResponseSchema,
  });

  insertUsage(opts.db, {
    operation: "lint",
    model: result.model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  const edit = await applyManualEdit(opts.wikiPath, opts.db, opts.pageSlug, {
    content: result.data.newContent,
  });

  return { edit, modelUsed: result.model, changeSummary: result.data.changeSummary };
}

// ---- internals ------------------------------------------------------------

async function readSchemaOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readSchema(wikiPath);
  } catch {
    return "(no schema set yet)";
  }
}

async function readIndexOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readIndex(wikiPath);
  } catch {
    return "(no index yet)";
  }
}
