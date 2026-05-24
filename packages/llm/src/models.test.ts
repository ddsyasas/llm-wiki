import { describe, expect, it } from "vitest";

import { estimateCostCents, getPricing, normalizeModelSlug } from "./models";

describe("normalizeModelSlug", () => {
  it("strips Anthropic's 8-digit date suffix", () => {
    expect(normalizeModelSlug("anthropic/claude-4.6-sonnet-20260217")).toBe(
      "anthropic/claude-4.6-sonnet",
    );
  });

  it("strips OpenAI's hyphenated date suffix", () => {
    expect(normalizeModelSlug("openai/gpt-4o-2024-08-06")).toBe("openai/gpt-4o");
  });

  it("leaves slugs without a date suffix alone", () => {
    expect(normalizeModelSlug("google/gemini-2.5-pro")).toBe("google/gemini-2.5-pro");
    expect(normalizeModelSlug("anthropic/claude-sonnet-4.6")).toBe("anthropic/claude-sonnet-4.6");
  });
});

describe("getPricing", () => {
  it("resolves OpenRouter's reordered Anthropic slug", () => {
    // Our canonical: anthropic/claude-sonnet-4.6
    // OpenRouter returns: anthropic/claude-4.6-sonnet (sometimes dated)
    expect(getPricing("anthropic/claude-4.6-sonnet")).not.toBeNull();
    expect(getPricing("anthropic/claude-4.6-sonnet-20260217")).not.toBeNull();
  });

  it("resolves the legacy Claude 3.5 family", () => {
    expect(getPricing("anthropic/claude-3-5-haiku")).not.toBeNull();
    expect(getPricing("anthropic/claude-3-5-sonnet")).not.toBeNull();
  });

  it("returns null for unknown models rather than guessing", () => {
    expect(getPricing("fictitious/model-1.0")).toBeNull();
  });
});

describe("estimateCostCents", () => {
  it("multiplies tokens by the per-million price and converts USD → cents", () => {
    // gpt-4o-mini: $0.15 in / $0.60 out per million
    // 1M in + 1M out = $0.15 + $0.60 = $0.75 = 75 cents
    expect(estimateCostCents("openai/gpt-4o-mini", 1_000_000, 1_000_000)).toBeCloseTo(75, 5);
  });

  it("returns null for unknown models", () => {
    expect(estimateCostCents("fictitious/model-1.0", 1000, 1000)).toBeNull();
  });
});
