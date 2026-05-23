// Client-side cost estimator. Mirrors packages/llm/src/models.ts pricing
// (kept duplicated so the UI doesn't need a server roundtrip).

export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

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
