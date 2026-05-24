import { NextResponse } from "next/server";

import { setOnboardingCompleted } from "@llm-wiki/core";

export const dynamic = "force-dynamic";

// POST /api/onboarding/complete — flips ~/.llm-wiki/config.json
// `onboardingCompletedAt` to the current ISO timestamp. Called from the
// last step of the first-run wizard (or when the user skips). Idempotent
// — re-call preserves the original timestamp.
//
// Single-purpose endpoint instead of a config-route field so callers
// don't have to worry about merging with apiKey writes.
export async function POST() {
  try {
    const cfg = await setOnboardingCompleted();
    return NextResponse.json({ ok: true, onboardingCompletedAt: cfg.onboardingCompletedAt });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to mark onboarding complete" },
      { status: 500 },
    );
  }
}
