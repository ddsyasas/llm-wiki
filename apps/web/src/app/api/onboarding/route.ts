import { NextResponse } from "next/server";

import {
  loadGlobalConfig,
  saveGlobalConfig,
  setOnboardingCompleted,
} from "@llm-wiki/core";

export const dynamic = "force-dynamic";

// POST /api/onboarding — flips ~/.llm-wiki/config.json
// `onboardingCompletedAt` to the current ISO timestamp. Called from the
// last step of the first-run wizard (or when the user skips). Idempotent
// — re-call preserves the original timestamp.
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

// DELETE /api/onboarding — clears the flag so the welcome wizard fires
// again on the next visit to /. Powers Settings → About "Replay welcome
// tour". Idempotent — clearing twice is a no-op.
export async function DELETE() {
  try {
    const current = await loadGlobalConfig();
    if (!current.onboardingCompletedAt) {
      return NextResponse.json({ ok: true, alreadyCleared: true });
    }
    // Strip the field by destructuring it out, then save the rest.
    const { onboardingCompletedAt: _drop, ...rest } = current;
    void _drop;
    await saveGlobalConfig({ ...rest, version: 1 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to clear onboarding flag" },
      { status: 500 },
    );
  }
}
