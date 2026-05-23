import { NextResponse } from "next/server";

import { getApiKey } from "@llm-wiki/core";

export const dynamic = "force-dynamic";

// Validates the stored API key against OpenRouter's /key endpoint, which
// requires auth and echoes the account's credit limit + usage. No tokens
// are consumed.
export async function POST() {
  const { key } = await getApiKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, reason: "no-key", message: "No API key configured." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/key", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://github.com/ddsyasas/llm-wiki",
        "X-Title": "LLM Wiki",
      },
    });

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { ok: false, reason: "invalid-key", message: "OpenRouter rejected the API key." },
        { status: 200 },
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: "remote-error",
          message: `OpenRouter returned ${response.status}.`,
        },
        { status: 200 },
      );
    }
    const body = (await response.json()) as {
      data?: { label?: string; usage?: number; limit?: number | null };
    };
    return NextResponse.json({
      ok: true,
      label: body.data?.label ?? null,
      usageUsd: body.data?.usage ?? 0,
      limitUsd: body.data?.limit ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: "network",
        message: `Could not reach OpenRouter: ${(err as Error).message}`,
      },
      { status: 200 },
    );
  }
}
