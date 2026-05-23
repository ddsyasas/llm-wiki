// Opt-in smoke test that hits the real OpenRouter API.
//
// Run with:
//   OPENROUTER_API_KEY=sk-or-v1-... pnpm --filter @llm-wiki/llm test
//
// Skipped automatically when the env var is absent so this doesn't block CI
// or local dev without credentials.

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { callLLM, createClient } from "./client";

const apiKey = process.env["OPENROUTER_API_KEY"];

describe.skipIf(!apiKey)("smoke: real OpenRouter call", () => {
  it(
    "returns a parsed JSON response from a cheap model",
    async () => {
      const client = createClient(apiKey!);
      const result = await callLLM({
        client,
        model: "anthropic/claude-3-5-haiku",
        system:
          "You output JSON only. No prose, no markdown fences. Always conform to the user's requested schema.",
        user: 'Return a JSON object with exactly one field named "message" set to the string "hello".',
        schema: z.object({ message: z.string() }),
        maxRetries: 2,
      });
      expect(result.data.message.toLowerCase()).toContain("hello");
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
    },
    30_000,
  );
});
