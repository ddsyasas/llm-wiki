"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type IngestSuccess = {
  ok: true;
  wikiPath: string;
  sourceId: string;
  rawFilename: string;
  model: string;
  response: {
    summary: string;
    newPages: Array<{ slug: string; title: string; type: string }>;
    pageUpdates: Array<{ slug: string; updateReason: string }>;
    contradictions: Array<{ description: string; pages: string[] }>;
  };
};

type IngestFailure = { ok: false; error: string; type?: string };
type IngestResponse = IngestSuccess | IngestFailure | { error: string };

export default function SourcesPage() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          ...(title.trim() ? { title: title.trim() } : {}),
        }),
      });
      const json = (await res.json()) as IngestResponse;
      if (!res.ok || !("ok" in json) || json.ok !== true) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setResult(json);
      setText("");
      setTitle("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Sources</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/settings" className="hover:text-foreground">
            Settings
          </Link>
          <Link href="/" className="hover:text-foreground">
            ← Home
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-medium">Paste a source</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The text is saved to <code className="rounded bg-muted px-1 py-0.5 text-xs">raw/</code>{" "}
          and then the LLM compiles it into wiki pages, cross-linking with anything it already
          knows. Markdown is fine; plain text is fine too.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="title">
              Title (optional)
            </label>
            <Input
              id="title"
              type="text"
              placeholder="e.g. Shor 1994 paper notes"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="text">
              Content
            </label>
            <Textarea
              id="text"
              rows={14}
              placeholder="Paste an article, paper, or notes here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              className="min-h-[280px] font-mono text-[13px] leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!text.trim() || busy}>
              {busy ? "Ingesting…" : "Ingest"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Takes ~10–30s with the default model. Long sources may take longer.
            </p>
          </div>
        </form>

        {error ? (
          <div className="mt-6 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 space-y-3 rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            <div>
              <strong>Ingested.</strong> {result.response.summary}
            </div>
            <div className="text-xs text-muted-foreground">
              Saved as <code>raw/{result.rawFilename}</code> via{" "}
              <code>{result.model}</code>. Wiki folder:{" "}
              <code className="break-all">{result.wikiPath}</code>
            </div>

            {result.response.newPages.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  New pages
                </h3>
                <ul className="mt-1 space-y-0.5">
                  {result.response.newPages.map((p) => (
                    <li key={p.slug}>
                      <code>{p.slug}</code> — {p.title}{" "}
                      <span className="text-muted-foreground">({p.type})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.response.pageUpdates.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Updated pages
                </h3>
                <ul className="mt-1 space-y-0.5">
                  {result.response.pageUpdates.map((p) => (
                    <li key={p.slug}>
                      <code>{p.slug}</code> — {p.updateReason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.response.contradictions.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contradictions flagged
                </h3>
                <ul className="mt-1 space-y-0.5">
                  {result.response.contradictions.map((c, i) => (
                    <li key={i}>
                      {c.description}{" "}
                      <span className="text-muted-foreground">[{c.pages.join(", ")}]</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        The wiki folder is at the path shown above — open it in Finder or your editor to see the
        real <code>.md</code> files.
      </p>
    </main>
  );
}
