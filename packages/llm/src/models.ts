// Model presets surfaced in the UI. Slugs follow OpenRouter's
// `<provider>/<model-id>` convention. Claude 3.5 was retired in 2025 — the
// 4.x family is current as of 2026-05. If a user's saved settings reference
// a retired slug, the LLM call throws UnknownModelError which the UI surfaces
// with a "switch model" suggestion.

export type ModelSlot = "ingest" | "query" | "lint" | "vision";

export const DEFAULT_MODELS: Record<ModelSlot, string> = {
  ingest: "anthropic/claude-haiku-4.5",
  query: "anthropic/claude-sonnet-4.6",
  lint: "anthropic/claude-sonnet-4.6",
  vision: "anthropic/claude-sonnet-4.6",
};

export type ModelChoice = {
  id: string;
  label: string;
  notes: string;
  /** Whether this model can read images / PDFs. */
  vision: boolean;
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
const PRICING: Record<string, ModelPricing> = {
  "anthropic/claude-haiku-4.5": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  "anthropic/claude-sonnet-4.6": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "anthropic/claude-opus-4.7": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  "openai/gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "openai/gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "google/gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  "google/gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "meta-llama/llama-3.3-70b-instruct": { inputPerMillion: 0.1, outputPerMillion: 0.3 },
};

export function getPricing(model: string): ModelPricing | null {
  return PRICING[model] ?? null;
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
