import { NextResponse } from "next/server";

import { getTotalCostCents, getUsageBreakdown } from "@llm-wiki/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await openWikiContext();
  try {
    const breakdown = getUsageBreakdown(ctx.db);
    const totalCostCents = getTotalCostCents(ctx.db);
    const totalCalls = breakdown.reduce((sum, r) => sum + r.call_count, 0);
    const totalInputTokens = breakdown.reduce((sum, r) => sum + r.total_input_tokens, 0);
    const totalOutputTokens = breakdown.reduce((sum, r) => sum + r.total_output_tokens, 0);
    return NextResponse.json({
      breakdown,
      totals: {
        cost_cents: totalCostCents,
        calls: totalCalls,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      },
    });
  } finally {
    ctx.db.close();
  }
}
