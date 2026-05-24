import Link from "next/link";

import {
  listPageRows,
  parseIndexEntries,
  readIndex,
  type PageRow,
} from "@llm-wiki/core";

import { PageContainer, PageHeader } from "@/components/page-shell";
import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// Category order on the page. Overviews first because they're the wiki's
// high-level synthesis — a researcher landing here wants the bird's-eye
// view before the specifics.
const TYPE_ORDER = ["overview", "concept", "entity", "comparison", "source"] as const;
type TypeKey = (typeof TYPE_ORDER)[number];

const TYPE_LABEL: Record<TypeKey, string> = {
  overview: "Overview",
  concept: "Concept",
  entity: "Entity",
  comparison: "Comparison",
  source: "Source",
};

const TYPE_HEADING: Record<TypeKey, string> = {
  overview: "Overviews",
  concept: "Concepts",
  entity: "Entities",
  comparison: "Comparisons",
  source: "Sources",
};

const TYPE_DESCRIPTION: Record<TypeKey, string> = {
  overview: "High-level synthesis pages that tie the topic together.",
  concept: "Ideas, techniques, frameworks, theorems.",
  entity: "People, organizations, products, places.",
  comparison: "Two or more things contrasted side-by-side.",
  source: "Standalone source-summary pages.",
};

function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Defensive: strip any [[wikilink]] markup that snuck into a summary so the
// card body reads as prose. Upstream firstSentence() handles this on rebuild,
// but old summaries may still carry brackets.
function cleanSummary(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .trim();
}

type EnrichedPage = PageRow & { summary: string };

export default async function WikiIndexPage() {
  const ctx = await openWikiContext();
  let pageRows: PageRow[] = [];
  let summaries = new Map<string, string>();
  let wikiPath = ctx.wikiPath;
  try {
    pageRows = listPageRows(ctx.db);
    const idx = await readIndex(ctx.wikiPath).catch(() => "");
    const parsed = parseIndexEntries(idx);
    summaries = new Map(
      Array.from(parsed.entries()).map(([slug, e]) => [slug, e.summary]),
    );
  } finally {
    ctx.db.close();
  }

  const enriched: EnrichedPage[] = pageRows.map((p) => ({
    ...p,
    summary: cleanSummary(summaries.get(p.slug) ?? ""),
  }));

  const totalPages = enriched.length;

  // ---- empty state -------------------------------------------------------
  if (totalPages === 0) {
    return (
      <PageContainer width="lg">
        <PageHeader
          eyebrow="Knowledge base"
          title="Wiki"
          description="LLM-maintained pages, grouped by type. The agent builds and cross-links them from your sources."
        />
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-h3 font-semibold">
            Your wiki is empty
          </p>
          <p className="mx-auto mt-2 max-w-md text-ui text-muted-foreground">
            Add a source on the{" "}
            <Link
              href="/sources"
              className="text-primary underline underline-offset-2"
            >
              Sources
            </Link>{" "}
            page (paste text, drop a PDF, or pull a URL) and the agent will compile it
            into cross-linked pages here.
          </p>
        </div>
      </PageContainer>
    );
  }

  // ---- grouped view ------------------------------------------------------
  const byType = new Map<TypeKey, EnrichedPage[]>();
  for (const p of enriched) {
    if (!isKnownType(p.type)) continue;
    const list = byType.get(p.type) ?? [];
    list.push(p);
    byType.set(p.type, list);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }

  const lastUpdate = enriched
    .map((p) => p.updated_at)
    .filter((s): s is string => Boolean(s))
    .sort()
    .at(-1);

  const summary = formatSummary(byType, totalPages, lastUpdate);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Knowledge base"
        title="Wiki"
        description={summary}
        actions={
          <Link
            href="/query"
            className="text-ui text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Ask a question →
          </Link>
        }
      />

      <div className="space-y-12">
        {TYPE_ORDER.filter((t) => byType.has(t)).map((type) => {
          const pages = byType.get(type)!;
          return (
            <section key={type}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                <div>
                  <h2 className="font-display text-h2 font-semibold tracking-tight">
                    {TYPE_HEADING[type]}
                    <span className="ml-2 text-caption font-normal tabular-nums text-muted-foreground">
                      {pages.length}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {TYPE_DESCRIPTION[type]}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pages.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/wiki/${p.slug}`}
                    className="group flex flex-col rounded-lg border border-border/70 bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/30"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {TYPE_LABEL[type]}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground/80">
                        {relativeDate(p.updated_at)}
                      </span>
                    </div>
                    <h3 className="mt-2 font-display text-xl font-semibold leading-tight tracking-tight text-foreground group-hover:text-primary">
                      {p.title}
                    </h3>
                    {p.summary ? (
                      <p className="mt-2 line-clamp-3 text-ui leading-relaxed text-muted-foreground">
                        {p.summary}
                      </p>
                    ) : (
                      <p className="mt-2 text-ui italic text-muted-foreground/60">
                        No summary yet — open page to read.
                      </p>
                    )}
                    {p.tags && p.tags.length > 0 ? (
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                        {p.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-10 text-caption text-muted-foreground">
        Wiki folder:{" "}
        <code className="font-mono break-all text-foreground/70">{wikiPath}</code>
      </p>
    </PageContainer>
  );
}

function isKnownType(t: string): t is TypeKey {
  return (TYPE_ORDER as readonly string[]).includes(t);
}

function formatSummary(
  byType: Map<TypeKey, EnrichedPage[]>,
  total: number,
  lastUpdate: string | undefined,
): string {
  const parts: string[] = [`${total} page${total === 1 ? "" : "s"}`];
  for (const t of TYPE_ORDER) {
    const list = byType.get(t);
    if (!list || list.length === 0) continue;
    parts.push(
      `${list.length} ${TYPE_LABEL[t].toLowerCase()}${list.length === 1 ? "" : "s"}`,
    );
  }
  if (lastUpdate) parts.push(`last update ${relativeDate(lastUpdate)}`);
  return parts.join(" · ");
}
