"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { CostPreview } from "@/components/cost-preview";
import { Card, PageContainer, PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWikiSettings } from "@/lib/use-wiki-settings";
import { cn } from "@/lib/utils";

type Mode = "paste" | "file" | "url";

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

type IngestResult = IngestSuccess | { ok: false; error: string; type?: string } | { error: string };

const ACCEPTED_EXTENSIONS = ".md,.markdown,.txt,.html,.htm,.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp";

export default function SourcesPage() {
  const [mode, setMode] = useState<Mode>("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    !busy &&
    ((mode === "paste" && text.trim().length > 0) ||
      (mode === "url" && url.trim().length > 0) ||
      (mode === "file" && file !== null));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      let res: Response;
      if (mode === "file" && file) {
        const form = new FormData();
        form.append("file", file);
        if (title.trim()) form.append("title", title.trim());
        res = await fetch("/api/ingest", { method: "POST", body: form });
      } else {
        const body: Record<string, string> = {};
        if (mode === "paste") body["text"] = text;
        if (mode === "url") body["url"] = url.trim();
        if (title.trim()) body["title"] = title.trim();
        res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const json = (await res.json()) as IngestResult;
      if (!res.ok || !("ok" in json) || json.ok !== true) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setResult(json);
      // Don't clear file/url so the user can see what they ingested.
      setText("");
      setTitle("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setMode("file");
    }
  }, []);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Add to wiki"
        title="Sources"
        description="Pasted text and Markdown go straight in. URLs fetch + extract via Readability. PDFs and images go through a vision model. DOCX/PPTX/XLSX get pre-parsed locally."
      />

      <section
        className={cn(
          "rounded-lg border bg-card p-5 text-card-foreground transition-colors",
          dragOver ? "border-primary ring-2 ring-primary/30" : "border-border/70",
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <div className="inline-flex rounded-md border border-border/70 bg-secondary/40 p-1 text-ui">
          {(["paste", "file", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-3 py-1 capitalize",
                mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="title">
              Title (optional)
            </label>
            <Input
              id="title"
              type="text"
              placeholder="Defaults: first line for paste, page title for URL, filename for file"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>

          {mode === "paste" ? (
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
          ) : null}

          {mode === "url" ? (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="url">
                URL
              </label>
              <Input
                id="url"
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Fetches the page, runs Mozilla&apos;s Readability to strip nav/ads, then ingests
                the cleaned article.
              </p>
            </div>
          ) : null}

          {mode === "file" ? (
            <div>
              <label className="mb-1 block text-sm font-medium">File</label>
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-background px-6 py-10 text-center",
                  dragOver ? "border-primary bg-primary/5" : null,
                )}
              >
                <p className="text-sm">
                  {file ? (
                    <>
                      Selected: <strong>{file.name}</strong>{" "}
                      <span className="text-muted-foreground">
                        ({Math.round(file.size / 1024)} KB)
                      </span>
                    </>
                  ) : (
                    <>
                      Drag a file here, or{" "}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-primary underline underline-offset-2"
                      >
                        choose one
                      </button>
                      .
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Supported: .md, .txt, .html, .pdf, .docx, .pptx, .xlsx, .png, .jpg, .webp
                </p>
                {file ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs text-muted-foreground underline"
                  >
                    Choose a different file
                  </button>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null;
                    setFile(picked);
                  }}
                />
              </div>
            </div>
          ) : null}

          <CostPreviewForSources mode={mode} text={text} file={file} url={url} />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!canSubmit}>
              {busy ? "Ingesting…" : "Ingest"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {mode === "file" && file && /\.(pdf|png|jpg|jpeg|webp)$/i.test(file.name)
                ? "Vision call — uses the model from Settings → Models → vision."
                : "Text call — uses the ingest model. ~10–30s for typical sources."}
            </p>
          </div>
        </form>

        {error ? <IngestErrorBanner message={error} /> : null}

        {result ? (
          <div className="mt-6 space-y-3 rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            <div>
              <strong>Ingested.</strong> {result.response.summary}
            </div>
            <div className="text-xs text-muted-foreground">
              Saved as <code>raw/{result.rawFilename}</code> via <code>{result.model}</code>. Wiki
              folder: <code className="break-all">{result.wikiPath}</code>
            </div>

            {result.response.newPages.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  New pages
                </h3>
                <ul className="mt-1 space-y-0.5">
                  {result.response.newPages.map((p) => (
                    <li key={p.slug}>
                      <Link href={`/wiki/${p.slug}`} className="underline underline-offset-2">
                        {p.slug}
                      </Link>{" "}
                      — {p.title}{" "}
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
                      <Link href={`/wiki/${p.slug}`} className="underline underline-offset-2">
                        {p.slug}
                      </Link>{" "}
                      — {p.updateReason}
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

      <p className="mt-6 text-caption text-muted-foreground">
        Open <Link href="/wiki" className="underline underline-offset-2">Wiki</Link> to browse
        the pages produced from your sources.
      </p>
    </PageContainer>
  );
}

// Cards make the page feel like one cohesive form. Drop the redundant <Card>
// wrapper for now — it's good enough as the single bordered section.
void Card;

// Schema-validation errors come back as a single long string from the LLM
// wrapper. Surface a friendly summary at the top with the raw detail
// collapsed underneath so power users can still see what the model returned.
function IngestErrorBanner({ message }: { message: string }) {
  const isSchemaError =
    message.includes("schema validation") || message.includes("not valid JSON");
  return (
    <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">
        {isSchemaError
          ? "The LLM returned malformed data."
          : "Ingest failed."}
      </p>
      {isSchemaError ? (
        <p className="mt-1 text-destructive/85">
          Try clicking <strong>Ingest</strong> again — small models occasionally drift on
          JSON output. If it keeps happening, switch to a smarter model in{" "}
          <a
            href="/settings"
            className="underline underline-offset-2 hover:text-destructive/70"
          >
            Settings → Models → ingest
          </a>{" "}
          (try <code className="font-mono text-xs">anthropic/claude-sonnet-4.6</code> or{" "}
          <code className="font-mono text-xs">openai/gpt-4o</code>).
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-destructive/70 hover:text-destructive">
          Show technical detail
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-background/50 p-2 font-mono text-[11px] text-destructive/80">
          {message}
        </pre>
      </details>
    </div>
  );
}

function CostPreviewForSources({
  mode,
  text,
  file,
  url,
}: {
  mode: Mode;
  text: string;
  file: File | null;
  url: string;
}) {
  const settings = useWikiSettings();
  if (!settings) return null;
  if (!settings.settings.showCostEstimates) return null;

  const isVision =
    mode === "file" && file !== null && /\.(pdf|png|jpg|jpeg|webp)$/i.test(file.name);
  const model = isVision
    ? settings.settings.defaultModels.vision
    : settings.settings.defaultModels.ingest;

  // For files, we estimate by file size; PDFs/images ride as base64 in the
  // multimodal call, so the input token cost is roughly bytes/3 (base64 overhead).
  let estimateInput = "";
  if (mode === "paste") estimateInput = text;
  else if (mode === "url") estimateInput = url ? `Article from ${url}, est. 3000 words` : "";
  else if (mode === "file" && file) {
    if (isVision) {
      // Vision: 1 image-ish payload ≈ 1500 tokens for a typical page.
      estimateInput = "x".repeat(Math.min(file.size, 50_000));
    } else {
      // Text file: estimate from size, capped to avoid huge previews.
      estimateInput = "x".repeat(Math.min(file.size, 200_000));
    }
  }

  return <CostPreview text={estimateInput} model={model} contextOverhead={5000} />;
}
