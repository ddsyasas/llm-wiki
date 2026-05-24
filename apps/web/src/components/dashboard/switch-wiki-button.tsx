"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Tiny per-card "Switch to this wiki" action on the dashboard. POSTs to
// /api/wikis (type: switch) then refreshes the server tree so the rest of
// the app re-points to the new active wiki — same plumbing the header chip
// + Cmd+K palette use. Kept here as a leaf client component so the
// dashboard page itself can stay a server component.
export function SwitchWikiButton({ path }: { path: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSwitch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wikis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "switch", path }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onSwitch}
        disabled={busy}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:border-primary/40 hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Switching…" : "Switch →"}
      </button>
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
