# 05 LLM Integration

## Provider: OpenRouter

We use [OpenRouter](https://openrouter.ai) as the single API provider. Reasons:

- One API key gives access to Claude, GPT, Gemini, Llama, Mistral, Qwen, and more
- Single OpenAI-compatible API surface (use the `openai` npm SDK)
- Pay-as-you-go, no minimums, no contracts
- Users get model choice without code changes
- They can switch providers later (direct Anthropic, OpenAI, Ollama) by changing the base URL

## Client setup

In `packages/llm/src/client.ts`:

```typescript
import OpenAI from "openai";

export function createClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/ddsyasas/llm-wiki",
      "X-Title": "LLM Wiki",
    },
  });
}
```

The `HTTP-Referer` and `X-Title` headers are OpenRouter conventions for app attribution. They don't reveal user data, just identify our project in OpenRouter analytics.

## Model presets

In `packages/llm/src/models.ts`, define three preset slots that map to specific models. Users can override these in settings.

```typescript
export const DEFAULT_MODELS = {
  // Cheap, fast model for ingestion (we process a lot of tokens here)
  ingest: "anthropic/claude-3-5-haiku",
  
  // Smarter model for synthesis and queries
  query: "anthropic/claude-3-5-sonnet",
  
  // Same as query for now, but separate so users can tune independently
  lint: "anthropic/claude-3-5-sonnet",
  
  // Vision-capable model for PDFs and images
  vision: "anthropic/claude-3-5-sonnet",
} as const;
```

Reasonable alternatives users might pick:
- `openai/gpt-4o-mini` for cheap/fast
- `openai/gpt-4o` for smart
- `google/gemini-pro-1.5` for long context
- `meta-llama/llama-3.3-70b-instruct` for open weights

Surface these as suggested presets in the settings UI.

## JSON contracts

Every LLM operation requests JSON output with a strict schema. We validate every response with `zod` before using it.

### Ingest contract

```typescript
// packages/core/src/schema.ts
import { z } from "zod";

export const IngestResponseSchema = z.object({
  summary: z.string(),
  newPages: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
    title: z.string(),
    type: z.enum(["entity", "concept", "source", "comparison", "overview"]),
    content: z.string(),
    tags: z.array(z.string()).default([]),
  })),
  pageUpdates: z.array(z.object({
    slug: z.string(),
    content: z.string(),
    updateReason: z.string(),
  })),
  indexEntries: z.array(z.object({
    slug: z.string(),
    category: z.enum(["entities", "concepts", "sources", "comparisons", "overviews"]),
    summary: z.string().max(120),
  })),
  logEntry: z.string(),
  contradictions: z.array(z.object({
    description: z.string(),
    pages: z.array(z.string()),
  })).default([]),
});

export type IngestResponse = z.infer<typeof IngestResponseSchema>;
```

### Query contract

```typescript
export const QueryResponseSchema = z.object({
  answer: z.string(),
  pagesUsed: z.array(z.string()),
  suggestedNewPage: z.object({
    slug: z.string(),
    title: z.string(),
    content: z.string(),
    reason: z.string(),
  }).nullable().default(null),
  confidence: z.enum(["high", "medium", "low"]),
  caveats: z.array(z.string()).default([]),
});
```

### Lint contract

```typescript
export const LintResponseSchema = z.object({
  issues: z.array(z.object({
    severity: z.enum(["high", "medium", "low"]),
    type: z.enum(["contradiction", "orphan", "missing-page", "broken-link", "gap", "stale"]),
    description: z.string(),
    affectedPages: z.array(z.string()),
    suggestedFix: z.string().nullable(),
  })),
  suggestedQuestions: z.array(z.string()).default([]),
  overallHealth: z.enum(["excellent", "good", "fair", "needs-work"]),
});
```

## System prompts

Keep system prompts in `packages/core/src/prompts/` as separate `.ts` files exporting string templates. This makes them easy to find, version, and test.

### Ingest prompt structure

```
You maintain an LLM Wiki following Andrej Karpathy's pattern.
Read the new source and produce structured updates.

Rules:
- Slugs are kebab-case, lowercase, hyphens only, no special chars
- Cross-links: [[slug]] or [[slug|Display Name]]
- One entity or concept per page, keep pages focused
- Update existing pages rather than duplicating info
- If new info contradicts a page, flag it in `contradictions` array
- Be concise. This is a personal wiki, not Wikipedia.
- Page type guidance:
  - entity: a person, organization, product, place
  - concept: an idea, technique, framework, theorem
  - source: a single document summary (for important sources only)
  - comparison: two or more entities/concepts contrasted
  - overview: high-level synthesis

User schema (their CLAUDE.md):
{SCHEMA}

Current wiki index:
{INDEX}

Existing pages (top 20 most relevant):
{PAGES}

Output ONLY valid JSON matching this schema, no preamble, no markdown fences:
{JSON_SCHEMA_DESCRIPTION}
```

### Query prompt structure

```
You answer questions against an LLM Wiki.

Process:
1. Read the index to find relevant pages
2. Read those pages
3. Synthesize an answer with [[slug]] citations
4. If you can't answer from the wiki, say so honestly
5. If the answer reveals a useful new page, suggest one

User schema:
{SCHEMA}

Wiki index:
{INDEX}

Relevant pages:
{PAGES}

User question:
{QUESTION}

Output ONLY valid JSON, no preamble, no markdown fences:
{JSON_SCHEMA_DESCRIPTION}
```

### Lint prompt structure

```
You health-check an LLM Wiki.

Look for:
- Contradictions between pages
- Stale claims (newer info supersedes them)
- Orphan pages (no inbound links)
- Important concepts mentioned but lacking their own page
- Broken cross-references ([[slug]] pointing to non-existent pages)
- Data gaps the wiki should fill

For each issue, suggest a fix when possible.
Also suggest follow-up questions the user could investigate.

User schema:
{SCHEMA}

Wiki index:
{INDEX}

All pages:
{PAGES}

Output ONLY valid JSON, no preamble, no markdown fences:
{JSON_SCHEMA_DESCRIPTION}
```

## Handling vision content

PDFs and images are sent directly as content blocks. With OpenRouter + Claude or GPT-4o:

```typescript
const response = await client.chat.completions.create({
  model: "anthropic/claude-3-5-sonnet",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Extract the key information from this PDF." },
        {
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${base64Pdf}` },
        },
      ],
    },
  ],
});
```

For PDFs that exceed the model's context, we fall back to first-page-only extraction for V1. Better PDF chunking is a V2 feature.

## Error handling

Every LLM call is wrapped in a function that handles:

1. **Network errors**: retry up to 3 times with exponential backoff
2. **Rate limits** (429): wait the Retry-After duration, then retry
3. **Invalid JSON**: ask the model to re-output, once. If that fails, surface to user.
4. **Context length errors**: surface to user with a "source too large" message
5. **Unknown model errors**: surface with "model not available on OpenRouter"

```typescript
// packages/llm/src/client.ts pattern
export async function callLLM<T>(opts: {
  client: OpenAI;
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxRetries?: number;
}): Promise<T> {
  // implementation handles all of the above
}
```

## Token estimation for cost previews

Before running an operation, estimate cost:

```typescript
// Rough estimate, good enough for previews
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // ~4 chars per token average
}
```

OpenRouter publishes per-model pricing. Hardcode known prices in `packages/llm/src/models.ts` with a fallback to "unknown cost" for new models.

## Streaming

Query responses should stream to the UI. Use OpenAI SDK's `.stream` method and pipe to a Server-Sent Events endpoint. The structured JSON contracts make this tricky for queries (you'd need to stream raw text and parse at the end), so for V1:

- Streaming for non-JSON outputs (free-form chat responses)
- Wait-and-parse for JSON outputs (ingest, lint, structured query)

For chat threads, use streaming and don't enforce a JSON schema, just plain markdown.
