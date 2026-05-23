import { NextResponse } from "next/server";

import { deleteApiKey, getApiKeyStatus, setApiKey } from "@/lib/server-config";

// Avoid any caching: these endpoints reflect mutable on-disk + keychain state.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getApiKeyStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to read config" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: { apiKey?: string } = {};
  try {
    body = (await req.json()) as { apiKey?: string };
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const key = body.apiKey;
  if (typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json({ error: "apiKey must be a non-empty string" }, { status: 400 });
  }

  try {
    const status = await setApiKey(key);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to save API key" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const status = await deleteApiKey();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "failed to delete API key" },
      { status: 500 },
    );
  }
}
