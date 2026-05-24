import { z } from "zod";

// Slug rule per docs/05: kebab-case, lowercase, hyphens only.
const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "slug must be kebab-case (lowercase, hyphens only)");

const pageTypeSchema = z.enum(["entity", "concept", "source", "comparison", "overview"]);

const indexCategorySchema = z.enum([
  "entities",
  "concepts",
  "sources",
  "comparisons",
  "overviews",
]);

// All array fields are required (callers should pass an empty array, not omit).
// This keeps the inferred TS type free of `| undefined` everywhere and forces
// the LLM to always return the array — we coerce empty arrays in to it.

// ---- Ingest ---------------------------------------------------------------

export const IngestResponseSchema = z.object({
  summary: z.string(),
  newPages: z.array(
    z.object({
      slug: slugSchema,
      title: z.string().min(1),
      type: pageTypeSchema,
      content: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  pageUpdates: z.array(
    z.object({
      slug: slugSchema,
      content: z.string(),
      updateReason: z.string(),
    }),
  ),
  indexEntries: z.array(
    z.object({
      slug: slugSchema,
      category: indexCategorySchema,
      // Strict cap at 500 — anything beyond that is the LLM going off the
      // rails and we want it surfaced. Below 500 we truncate gracefully to
      // 200 chars so the index.md line stays readable. Validation never
      // fails for "summary slightly too long" — that was happening even
      // with Sonnet 4.6 (the prompt says <=120 but the model drifts).
      summary: z
        .string()
        .max(500)
        .transform((s) => (s.length > 200 ? `${s.slice(0, 199).trimEnd()}…` : s)),
    }),
  ),
  logEntry: z.string(),
  contradictions: z.array(
    z.object({
      description: z.string(),
      pages: z.array(slugSchema),
    }),
  ),
});

export type IngestResponse = z.infer<typeof IngestResponseSchema>;
export type IndexCategory = z.infer<typeof indexCategorySchema>;

// ---- Query ----------------------------------------------------------------

export const QueryResponseSchema = z.object({
  answer: z.string(),
  pagesUsed: z.array(slugSchema),
  suggestedNewPage: z
    .object({
      slug: slugSchema,
      title: z.string(),
      content: z.string(),
      reason: z.string(),
    })
    .nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  caveats: z.array(z.string()),
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

// ---- Lint -----------------------------------------------------------------

export const LintResponseSchema = z.object({
  issues: z.array(
    z.object({
      severity: z.enum(["high", "medium", "low"]),
      type: z.enum(["contradiction", "orphan", "missing-page", "broken-link", "gap", "stale"]),
      description: z.string(),
      affectedPages: z.array(slugSchema),
      suggestedFix: z.string().nullable(),
    }),
  ),
  suggestedQuestions: z.array(z.string()),
  overallHealth: z.enum(["excellent", "good", "fair", "needs-work"]),
});

export type LintResponse = z.infer<typeof LintResponseSchema>;
