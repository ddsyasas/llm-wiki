import { callLLM, type LlmClient } from "@llm-wiki/llm";

import type { Db } from "./db";
import { searchPages } from "./db-pages";
import { insertUsage } from "./db-usage";
import { buildQueryPrompt } from "./prompts/query";
import type { ExistingPageSnippet } from "./prompts/ingest";
import { QueryResponseSchema, type QueryResponse } from "./schema";
import { readIndex, readPage, readSchema } from "./wiki";

const TOP_K_RELEVANT_PAGES = 10;

export type QueryProgressEvent =
  | { phase: "context"; message: string }
  | { phase: "llm"; message: string }
  | { phase: "done"; result: QueryResponse };

export type QueryWikiOptions = {
  question: string;
  wikiPath: string;
  db: Db;
  client: LlmClient;
  /** Per docs/05, use the query model slot (defaults to a smart model). */
  model: string;
  onProgress?: (event: QueryProgressEvent) => void;
};

/**
 * Answers a one-off question against the wiki. Pure read path — never writes
 * pages. The caller decides whether to promote suggestedNewPage via createPage.
 */
export async function queryWiki(opts: QueryWikiOptions): Promise<QueryResponse> {
  if (!opts.question.trim()) {
    throw new Error("queryWiki: question must be non-empty");
  }

  opts.onProgress?.({ phase: "context", message: "Loading wiki schema and index..." });

  const [schema, index] = await Promise.all([
    readSchemaOrDefault(opts.wikiPath),
    readIndexOrDefault(opts.wikiPath),
  ]);

  opts.onProgress?.({ phase: "context", message: "Searching for relevant pages..." });
  const relevantPages = await loadRelevantPages(opts.wikiPath, opts.db, opts.question);

  opts.onProgress?.({ phase: "llm", message: `Calling ${opts.model}...` });

  const prompt = buildQueryPrompt({
    schema,
    index,
    relevantPages,
    question: opts.question,
  });

  const result = await callLLM({
    client: opts.client,
    model: opts.model,
    system: prompt.system,
    user: prompt.user,
    schema: QueryResponseSchema,
  });

  insertUsage(opts.db, {
    operation: "query",
    model: result.model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  opts.onProgress?.({ phase: "done", result: result.data });
  return result.data;
}

// ---- internals ------------------------------------------------------------

async function readSchemaOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readSchema(wikiPath);
  } catch {
    return "(no schema set yet — assume a general-purpose personal wiki)";
  }
}

async function readIndexOrDefault(wikiPath: string): Promise<string> {
  try {
    return await readIndex(wikiPath);
  } catch {
    return "(no index yet)";
  }
}

async function loadRelevantPages(
  wikiPath: string,
  db: Db,
  question: string,
): Promise<ExistingPageSnippet[]> {
  let hits: Array<{ slug: string; title: string }> = [];
  try {
    hits = searchPages(db, question, TOP_K_RELEVANT_PAGES);
  } catch {
    hits = [];
  }

  const snippets: ExistingPageSnippet[] = [];
  for (const hit of hits) {
    try {
      const page = await readPage(wikiPath, hit.slug);
      snippets.push({
        slug: page.slug,
        title: page.frontmatter.title,
        type: page.frontmatter.type,
        excerpt: page.content,
      });
    } catch {
      // FTS5 row but missing on disk — drift; skip.
    }
  }
  return snippets;
}
