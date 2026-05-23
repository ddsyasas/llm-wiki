// Client-side cost estimator. Mirrors packages/llm/src/models.ts pricing.
// Keeps a duplicate copy here so the UI doesn't need a server roundtrip
// (and so updating one doesn't drag the other along — pricing changes are
// rare enough that the duplication is fine).

export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

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

/** Rough 4-char-per-token approximation, good enough for previews. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type CostEstimate = {
  inputTokens: number;
  outputTokens: number;
  costCents: number | null;
  model: string;
  unknownPricing: boolean;
};

/**
 * @param sourceText The user-facing input (paste body, URL placeholder, etc.).
 * @param model The model slug that will run the request.
 * @param contextOverhead Extra input tokens we expect from system + index + relevant pages.
 *                        Defaults are ballpark figures from a representative wiki.
 * @param expectedOutputTokens Estimated response size.
 */
export function estimateCost(
  sourceText: string,
  model: string,
  contextOverhead = 5000,
  expectedOutputTokens = 800,
): CostEstimate {
  const inputTokens = estimateTokens(sourceText) + contextOverhead;
  const pricing = getPricing(model);
  if (!pricing) {
    return {
      inputTokens,
      outputTokens: expectedOutputTokens,
      costCents: null,
      model,
      unknownPricing: true,
    };
  }
  const usd =
    (pricing.inputPerMillion * inputTokens + pricing.outputPerMillion * expectedOutputTokens) /
    1_000_000;
  return {
    inputTokens,
    outputTokens: expectedOutputTokens,
    costCents: usd * 100,
    model,
    unknownPricing: false,
  };
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatCostCents(cents: number | null): string {
  if (cents === null) return "unknown";
  if (cents < 0.1) return "<$0.001";
  if (cents < 1) return `~$${(cents / 100).toFixed(4)}`;
  if (cents < 100) return `~$${(cents / 100).toFixed(3)}`;
  return `~$${(cents / 100).toFixed(2)}`;
}
