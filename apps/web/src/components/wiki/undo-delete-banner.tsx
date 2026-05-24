"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  /** Slug of the page that was just deleted (the destination for restore). */
  slug: string;
  /** Display title for the banner copy. */
  title: string;
  /** Filename inside .llm-wiki/trash/wiki/ — passed to the restore endpoint. */
  trashFilename: string;
};

// Shown at the top of /wiki when the page-view delete flow redirects with
// ?deleted=&trash= in the URL. One-click Undo posts to the restore endpoint
// and refreshes; Dismiss clears the query params without restoring.
export function UndoDeleteBanner({ slug, title, trashFilename }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    // Strip the query params so a refresh doesn't show the banner again.
    router.replace("/wiki");
  }

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pages/${encodeURIComponent(slug)}/restore`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trashFilename }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      // Restored — strip query params and refresh so the page reappears in
      // the wiki index.
      setHidden(true);
      router.replace("/wiki");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
      <div className="flex-1 text-emerald-800 dark:text-emerald-200">
        Moved <strong>{title}</strong> to trash.{" "}
        <span className="text-emerald-700/80 dark:text-emerald-300/80">
          Recoverable from <code className="font-mono text-[11px]">.llm-wiki/trash/wiki/</code>{" "}
          for 30 days.
        </span>
        {error ? (
          <span className="mt-1 block text-destructive">{error}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void undo()}
          disabled={busy}
        >
          {busy ? "Restoring…" : "Undo"}
        </Button>
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="text-xs text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-300/70 dark:hover:text-emerald-100"
        >
          dismiss
        </button>
      </div>
    </div>
  );
}
