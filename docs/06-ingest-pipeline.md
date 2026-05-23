# 06 Ingest Pipeline

## Overview

A source enters the pipeline in one of three ways: file upload, pasted text, or URL. Each goes through detection, extraction, normalization, then LLM compilation into wiki updates.

```
Source In
   │
   ▼
[Detect format] → [Extract to markdown] → [Save to raw/]
                                                │
                                                ▼
                                       [LLM ingest call]
                                                │
                                                ▼
                              [Validate JSON, write updates to wiki/, index.md, log.md]
```

## Supported source types in V1

| Type | How it's handled | Library |
|------|-----------------|---------|
| `.md`, `.txt` | Pass through | none |
| `.html` | Extract main content with `@mozilla/readability` and `jsdom`, convert to markdown with `turndown` | `@mozilla/readability`, `jsdom`, `turndown` |
| URL | Fetch with `undici`, then HTML pipeline | `undici` + above |
| `.docx` | Extract text and basic formatting | `mammoth` |
| `.pptx`, `.xlsx` | Extract text content | `officeparser` |
| `.pdf` | Send pages directly to vision model | LLM |
| `.png`, `.jpg`, `.webp` | Send directly to vision model | LLM |
| Pasted text | Treat as plain text source | none |

## File detection

In `packages/ingestion/src/detect.ts`:

```typescript
export type SourceFormat = 
  | "markdown" | "text" | "html" | "url" 
  | "docx" | "pptx" | "xlsx" 
  | "pdf" | "image";

export function detectFormat(filename: string, content?: Buffer): SourceFormat {
  // Use file extension primarily
  // Fall back to magic-bytes for safety (file-type npm package)
}
```

## Extraction phase

Each format has a module that exports a single function:

```typescript
// packages/ingestion/src/docx.ts
export async function extractDocx(buffer: Buffer): Promise<ExtractedSource> {
  // returns { title, content (markdown), metadata }
}

// Shared type
export type ExtractedSource = {
  title: string;
  content: string;            // markdown
  metadata: Record<string, unknown>;  // extracted from frontmatter, doc props, etc.
  imageUrls?: string[];       // for sources with embedded images
};
```

## Saving to raw/

After extraction:

1. Generate a unique filename: `YYYY-MM-DD-{slug}.{ext}` where slug comes from the title
2. Write the original file to `raw/` (preserve the binary as-is, NOT the extracted markdown)
3. Also write a sibling `.extracted.md` file with the markdown extraction (for caching)
4. Insert a row in `sources` table

Why keep the original: the user might want to re-extract later with better tools, or share the source with someone else.

## LLM ingestion phase

The big call. In `packages/core/src/ingest.ts`:

```typescript
export async function ingestSource(opts: {
  source: ExtractedSource;
  wikiPath: string;
  client: OpenAI;
  model: string;
  onProgress?: (msg: string) => void;
}): Promise<IngestResponse> {
  // 1. Load current schema (CLAUDE.md)
  // 2. Load current index.md
  // 3. Load top-K most relevant existing pages (use FTS5 search against extracted source content)
  // 4. Construct prompt
  // 5. Call LLM with JSON output expectation
  // 6. Validate response with zod schema
  // 7. Return parsed response
}
```

### Choosing which existing pages to include

We can't include every page in the context window. Strategy:

1. Always include `index.md` (cheap, gives the LLM the full catalog)
2. For "relevant pages", use FTS5 to search for top-K (K=15) pages matching the extracted source's content
3. Cap the total context at 80% of the model's input limit
4. If a page is very long, include its first 1000 words + a "[truncated]" marker

### Writing the updates

After successful JSON parse:

```typescript
// packages/core/src/ingest.ts (continued)
async function applyIngestResponse(opts: {
  response: IngestResponse;
  wikiPath: string;
  sourceId: string;
}) {
  // 1. For each newPage:
  //    - Write `wiki/{slug}.md` with frontmatter + content
  //    - Insert into pages table
  //    - Insert into pages_fts
  //    - Link to source in page_sources table
  
  // 2. For each pageUpdate:
  //    - Read existing page file
  //    - Save backup to `.llm-wiki/page-history/{slug}-{timestamp}.md`
  //    - Write new content (preserve frontmatter, update `updated` field)
  //    - Update pages table
  //    - Update pages_fts
  
  // 3. Rebuild index.md from indexEntries (merge with existing entries)
  
  // 4. Append logEntry to log.md
  
  // 5. Mark source as ingested in sources table
}
```

## Index rebuild logic

The LLM returns `indexEntries` for new and updated pages. We don't trust it to maintain the FULL index correctly across many ingestions. Instead:

1. Take the LLM's entries for changed pages
2. Merge with the existing index entries for unchanged pages
3. Re-sort by category, then alphabetically
4. Write the result to `index.md`

This way the index is always complete and consistent, even if the LLM only knows about the pages it just touched.

## Progress streaming

For UI feedback, the ingest function emits progress messages via the `onProgress` callback. The API route forwards these via Server-Sent Events:

```
[10%] Extracting content from PDF...
[30%] Analyzing existing wiki context...
[50%] Calling LLM (estimated 30s)...
[80%] Writing 3 new pages, updating 7 existing pages...
[100%] Done. View changes in the wiki.
```

## Token cost estimation

Before the LLM call, compute:

```typescript
const estimatedInputTokens = 
  estimateTokens(schema) + 
  estimateTokens(index) + 
  estimateTokens(relevantPages) + 
  estimateTokens(sourceContent);

const estimatedOutputTokens = Math.min(4000, estimatedInputTokens * 0.3);

const estimatedCost = priceFor(model, estimatedInputTokens, estimatedOutputTokens);
```

Show this to the user before they confirm the ingest, especially for large sources. Default: auto-confirm if estimated cost is under $0.10, prompt otherwise.

## Error recovery

If the LLM call fails or returns invalid JSON:

1. The source file stays in `raw/` (it's been saved)
2. The source is marked in SQLite with `ingested_at = null` and an `ingest_error` field
3. The UI shows the source as "Not yet ingested" with a "Retry" button
4. No partial writes to the wiki; ingestion is all-or-nothing

## Batch ingestion

For users dropping in many files at once:

- Process serially, not in parallel (rate limits, and the model needs accurate index for each pass)
- Show overall progress (X of Y sources processed)
- If one fails, continue with the rest
- Report a summary at the end

V1 has a simple "Add multiple files" button. V2 might add a watch mode.

## Special case: chats as sources

A nice power-user feature: any chat thread can be "ingested" as if it were a source. This lets useful conversations get promoted into the wiki's permanent layer.

When ingesting a chat:
- Source type is `chat`
- The chat file is the "original" (no separate extraction step)
- Same LLM ingest call, same JSON contract
- The chat file stays where it was; ingestion just creates wiki pages from it

This implements Karpathy's point: "good answers can be filed back into the wiki as new pages."
