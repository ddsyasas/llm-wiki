// Per docs/05: model presets that map operation slots to specific
// OpenRouter model IDs. Users override these via settings.

export type ModelSlot = "ingest" | "query" | "lint" | "vision";

export const DEFAULT_MODELS: Record<ModelSlot, string> = {
  ingest: "anthropic/claude-3-5-haiku",
  query: "anthropic/claude-3-5-sonnet",
  lint: "anthropic/claude-3-5-sonnet",
  vision: "anthropic/claude-3-5-sonnet",
};

// Suggested presets surfaced in the settings UI (per docs/05).
export const SUGGESTED_MODELS: ReadonlyArray<{ id: string; label: string; notes?: string }> = [
  { id: "anthropic/claude-3-5-haiku", label: "Claude 3.5 Haiku", notes: "fast and cheap" },
  { id: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet", notes: "smarter, vision-capable" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", notes: "very cheap" },
  { id: "openai/gpt-4o", label: "GPT-4o", notes: "smart, vision-capable" },
  { id: "google/gemini-pro-1.5", label: "Gemini Pro 1.5", notes: "long context" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", notes: "open weights" },
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
  "anthropic/claude-3-5-haiku": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  "anthropic/claude-3-5-sonnet": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "openai/gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "openai/gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "google/gemini-pro-1.5": { inputPerMillion: 1.25, outputPerMillion: 5.0 },
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
