// Model presets surfaced in the UI. Slugs follow OpenRouter's
// `<provider>/<model-id>` convention. Claude 3.5 was retired in 2025 — the
// 4.x family is current as of 2026-05. If a user's saved settings reference
// a retired slug, the LLM call throws UnknownModelError which the UI surfaces
// with a "switch model" suggestion.

export type ModelSlot = "ingest" | "query" | "chat" | "lint" | "vision";

export const DEFAULT_MODELS: Record<ModelSlot, string> = {
  ingest: "anthropic/claude-haiku-4.5",
  query: "anthropic/claude-sonnet-4.6",
  chat: "anthropic/claude-sonnet-4.6",
  lint: "anthropic/claude-sonnet-4.6",
  vision: "anthropic/claude-sonnet-4.6",
};

export type ModelChoice = {
  id: string;
  label: string;
  notes: string;
  /** Whether this model can read images / PDFs. */
  vision: boolean;
  /**
   * True for OpenRouter `:free` routes. Users still need an OpenRouter
   * account + key, but per-call cost is zero. Free tier has stricter
   * rate limits and routes may retain prompts for provider training —
   * the Settings banner warns about both when any slot uses one.
   */
  free?: boolean;
};

// Curated dropdown options for the Settings → Models tab. Order matters —
// cheap/fast first within each provider. The UI also lets users type a
// custom slug for anything not in this list.
export const SUGGESTED_MODELS: ReadonlyArray<ModelChoice> = [
  // Anthropic (current as of 2026-05)
  {
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    notes: "Cheap + fast. Default for ingest.",
    vision: true,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    notes: "Smart + vision. Default for query, lint, vision.",
    vision: true,
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    notes: "Most capable Anthropic model. Pricey.",
    vision: true,
  },
  // OpenAI
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    notes: "Cheapest option. Reliable JSON.",
    vision: true,
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    notes: "OpenAI's smart + vision model.",
    vision: true,
  },
  // Google
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    notes: "Long context, strong reasoning.",
    vision: true,
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    notes: "Cheap + fast Google option.",
    vision: true,
  },
  // Open weights
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    notes: "Open weights. No vision.",
    vision: false,
  },
  // OpenRouter free tier. Per-call cost: $0. Picks chosen for the wiki's
  // JSON-strict workload — smaller free models often fail schema validation.
  // Caveats (rate limits, privacy) surface as a Settings banner when any
  // slot uses one of these.
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (free)",
    notes: "FREE · proven JSON, 131K ctx. Good for ingest / lint.",
    vision: false,
    free: true,
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron Super 120B (free)",
    notes: "FREE · 1M ctx, biggest free model. Good for query / chat.",
    vision: false,
    free: true,
  },
  {
    id: "deepseek/deepseek-v4-flash:free",
    label: "DeepSeek V4 Flash (free)",
    notes: "FREE · fast reasoning, 1M ctx. Good for query / chat.",
    vision: false,
    free: true,
  },
  {
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B (free)",
    notes: "FREE · vision-capable, 262K ctx. Good for vision slot.",
    vision: true,
    free: true,
  },
];

export type ModelPricing = {
  /** USD per 1,000,000 input tokens */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens */
  outputPerMillion: number;
};

// Hardcoded prices, accurate as of 2026-05. These shift over time on
// OpenRouter; revisit before each release. A `null` from `getPricing`
// surfaces in the UI as "unknown cost" rather than guessing.
//
// Why so many duplicate entries:
// - Our SUGGESTED_MODELS / DEFAULT_MODELS use the slug we send to OpenRouter
//   (e.g. `anthropic/claude-sonnet-4.6`). But OpenRouter's response.model
//   often comes back in a different order (`anthropic/claude-4.6-sonnet`)
//   and sometimes with a release-date suffix (`-20260217`). Both forms end
//   up in the `usage` table, so both need pricing entries.
// - The 3.5 family is retired but historical rows reference it; pricing is
//   from OpenRouter's archived listings.
const PRICING: Record<string, ModelPricing> = {
  // Current Anthropic — our canonical slug + OpenRouter's reordered form
  "anthropic/claude-haiku-4.5": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  "anthropic/claude-4.5-haiku": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  "anthropic/claude-sonnet-4.6": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "anthropic/claude-4.6-sonnet": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "anthropic/claude-opus-4.7": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  "anthropic/claude-4.7-opus": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  // Legacy Anthropic 3.x family — retired but rows in older wikis reference them
  "anthropic/claude-3-5-haiku": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  "anthropic/claude-3-5-sonnet": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "anthropic/claude-3-haiku": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  "anthropic/claude-3-opus": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  // OpenAI
  "openai/gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "openai/gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  // Google
  "google/gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  "google/gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  // Open weights
  "meta-llama/llama-3.3-70b-instruct": { inputPerMillion: 0.1, outputPerMillion: 0.3 },
  // OpenRouter free tier — zero per-call cost. Rate limits + privacy
  // caveats are user-facing, not billing-facing.
  "meta-llama/llama-3.3-70b-instruct:free": { inputPerMillion: 0, outputPerMillion: 0 },
  "nvidia/nemotron-3-super-120b-a12b:free": { inputPerMillion: 0, outputPerMillion: 0 },
  "deepseek/deepseek-v4-flash:free": { inputPerMillion: 0, outputPerMillion: 0 },
  "google/gemma-4-31b-it:free": { inputPerMillion: 0, outputPerMillion: 0 },
};

/**
 * OpenRouter (and the upstream provider) sometimes attaches a release-date
 * suffix to the model slug in the response — `anthropic/claude-4.6-sonnet-20260217`
 * or `openai/gpt-4o-2024-08-06`. We don't want a date-pinned variant to
 * disappear from cost tracking, so strip the suffix for pricing lookup.
 * The original slug is still stored verbatim in the `usage` table.
 */
export function normalizeModelSlug(model: string): string {
  return model.replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, "");
}

export function getPricing(model: string): ModelPricing | null {
  return PRICING[model] ?? PRICING[normalizeModelSlug(model)] ?? null;
}

export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const p = getPricing(model);
  if (!p) return null;
  const usd = (p.inputPerMillion * inputTokens + p.outputPerMillion * outputTokens) / 1_000_000;
  return usd * 100;
}

// Rough char-to-token approximation. Good enough for pre-flight cost
// previews; real costs come from the provider's reported usage after the
// call completes.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
