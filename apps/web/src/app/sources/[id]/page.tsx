import { readFile } from "node:fs/promises";
import { join } from "node:path";

import Link from "next/link";
import { notFound } from "next/navigation";

import { getSource, listPageRows, WIKI_PATHS } from "@llm-wiki/core";

import { PageContainer, PageHeader } from "@/components/page-shell";
import { MarkdownView } from "@/components/wiki/markdown-view";
import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

const MAX_RAW_BYTES = 1_000_000; // 1 MB

const FORMAT_LABEL: Record<string, string> = {
  markdown: "Markdown",
  md: "Markdown",
  text: "Plain text",
  txt: "Plain text",
  html: "HTML",
  url: "URL extract",
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  xlsx: "XLSX",
  image: "Image",
};

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

// Pages that list this source in their page_sources rows. Cheap query —
// joins a small table on a small one. Tells the user "where did this source
// end up in the wiki".
function pagesUsingSource(
  ctx: Awaited<ReturnType<typeof openWikiContext>>,
  sourceId: string,
): Array<{ slug: string; title: string }> {
  const rows = ctx.db
    .prepare(
      `SELECT p.slug, p.title FROM page_sources ps
       JOIN pages p ON p.slug = ps.page_slug
       WHERE ps.source_id = ?
       ORDER BY p.title`,
    )
    .all(sourceId) as Array<{ slug: string; title: string }>;
  return rows;
}

export default async function SourceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await openWikiContext();
  try {
    const source = getSource(ctx.db, params.id);
    if (!source) notFound();

    const pages = pagesUsingSource(ctx, params.id);
    const knownSlugs = listPageRows(ctx.db).map((r) => r.slug);

    const rawPath = join(ctx.wikiPath, WIKI_PATHS.raw, source.filename);
    let rawText: string | null = null;
    let rawError: string | null = null;
    let truncated = false;
    try {
      const buf = await readFile(rawPath);
      if (buf.length > MAX_RAW_BYTES) {
        rawText = buf.subarray(0, MAX_RAW_BYTES).toString("utf8");
        truncated = true;
      } else {
        rawText = buf.toString("utf8");
      }
      // Quick binary sniff — the replacement char shows up when utf8 decode
      // hits non-text bytes.
      if (rawText.includes("�")) {
        rawText = null;
        rawError = "Binary file — open in an editor that handles this format.";
      }
    } catch (err) {
      rawError = (err as Error).message ?? "failed to read raw file";
    }

    const title =
      source.title?.trim() || source.original_name?.trim() || source.filename;
    const formatLabel = FORMAT_LABEL[source.format] ?? source.format.toUpperCase();

    return (
      <PageContainer width="lg">
        <PageHeader
          eyebrow="Source"
          title={title}
          description={
            <span className="font-mono text-[13px] break-all">{rawPath}</span>
          }
          actions={
            <Link
              href="/sources"
              className="text-ui text-primary underline underline-offset-2 hover:text-primary/80"
            >
              ← All sources
            </Link>
          }
        />

        {/* Metadata strip — format, dates, size, original URL if any. The
            things you'd want at a glance before reading the body. */}
        <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border/70 bg-card p-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Format
            </dt>
            <dd className="mt-0.5 font-medium">{formatLabel}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Size
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {formatSize(source.size_bytes)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Added
            </dt>
            <dd className="mt-0.5 font-mono text-[12px]">{formatDate(source.added_at)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Ingested
            </dt>
            <dd className="mt-0.5 font-mono text-[12px]">
              {source.ingested_at ? formatDate(source.ingested_at) : "pending"}
            </dd>
          </div>
          {source.original_name ? (
            <div className="col-span-2">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Original filename
              </dt>
              <dd className="mt-0.5 font-mono text-[12px]">{source.original_name}</dd>
            </div>
          ) : null}
          {source.url ? (
            <div className="col-span-2">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Source URL
              </dt>
              <dd className="mt-0.5">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-[12px] text-primary underline underline-offset-2"
                >
                  {source.url}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Wiki pages that the LLM produced from this source. The
            "compounded into the wiki" view — answers "where did this
            source end up?" */}
        {pages.length > 0 ? (
          <section className="mb-6 rounded-md border border-border/70 bg-card p-4">
            <h2 className="mb-2 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              Contributed to {pages.length} wiki page{pages.length === 1 ? "" : "s"}
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {pages.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/wiki/${p.slug}`}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:border-primary/40 hover:bg-accent"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Raw body — the unmodified content as the LLM saw it. Markdown
            renders nicely; plain text falls through the same renderer. */}
        <section>
          <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            Raw content
          </h2>
          {rawError ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <p>{rawError}</p>
              <p className="mt-2 text-xs">
                Open the file at{" "}
                <code className="font-mono break-all">{rawPath}</code> in your editor.
              </p>
            </div>
          ) : rawText ? (
            <>
              <article className="rounded-md border border-border/70 bg-card p-5">
                <MarkdownView content={rawText} knownSlugs={knownSlugs} />
              </article>
              {truncated ? (
                <p className="mt-2 text-caption text-muted-foreground">
                  Truncated at 1 MB. Full content is on disk at{" "}
                  <code className="font-mono break-all">{rawPath}</code>.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No content available.</p>
          )}
        </section>
      </PageContainer>
    );
  } finally {
    ctx.db.close();
  }
}
