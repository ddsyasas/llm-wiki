import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import Link from "next/link";
import { notFound } from "next/navigation";

import { readPage, WIKI_PATHS } from "@llm-wiki/core";

import { PageContainer, PageHeader } from "@/components/page-shell";
import { HistoryDiffView } from "@/components/wiki/history-diff-view";
import { openWikiContext, requireSetup } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

const PAGE_HISTORY_DIR = "page-history";

// Backups live at <wikiPath>/.llm-wiki/page-history/<slug>-<isoStamp>.md.
// applyManualEdit writes one before every edit (manual or LLM-driven), so
// the listing is in chronological order by the timestamp embedded in the
// filename. We parse the stamp out so the picker can show "2 hours ago"
// instead of the ISO blob.
type Backup = {
  filename: string;
  /** ISO timestamp parsed from the filename's <slug>-<ISO>.md suffix. */
  timestamp: string;
  sizeBytes: number;
};

async function listBackupsForSlug(
  wikiPath: string,
  slug: string,
): Promise<Backup[]> {
  const dir = join(wikiPath, WIKI_PATHS.tooling, PAGE_HISTORY_DIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: Backup[] = [];
  // Backup filename shape: "<slug>-<YYYY-MM-DDTHH-MM-SS-mmmZ>.md".
  // The timestamp segment uses '-' for ':' so it's filesystem-safe; we
  // restore the colons to make it parseable by Date.
  const prefix = `${slug}-`;
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith(".md")) continue;
    const middle = name.slice(prefix.length, -3);
    const isoLike = middle.replace(
      /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-/,
      "$1:$2:$3.",
    );
    const filePath = join(dir, name);
    let sizeBytes = 0;
    try {
      const s = await stat(filePath);
      sizeBytes = s.size;
    } catch {
      // skip
    }
    out.push({ filename: name, timestamp: isoLike, sizeBytes });
  }
  // Newest first — most recent edits are what users usually want to inspect.
  out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return out;
}

export default async function PageHistoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { backup?: string };
}) {
  await requireSetup();
  const ctx = await openWikiContext();
  try {
    let currentPage;
    try {
      currentPage = await readPage(ctx.wikiPath, params.slug);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") notFound();
      throw err;
    }

    const backups = await listBackupsForSlug(ctx.wikiPath, params.slug);

    // Selected backup defaults to the most recent. If a ?backup= query is
    // present we honor it as long as it matches one of the listed files
    // (defense against arbitrary path probing).
    const requested = searchParams?.backup;
    const selected = backups.find((b) => b.filename === requested) ?? backups[0] ?? null;

    let backupContent: string | null = null;
    if (selected) {
      try {
        backupContent = await readFile(
          join(ctx.wikiPath, WIKI_PATHS.tooling, PAGE_HISTORY_DIR, selected.filename),
          "utf8",
        );
      } catch {
        backupContent = null;
      }
    }

    return (
      <PageContainer width="xl">
        <PageHeader
          eyebrow="Edit history"
          title={currentPage.frontmatter.title}
          description={
            <>
              Every page edit (manual or LLM-driven) backs up the prior version
              to <code className="font-mono text-[12px]">.llm-wiki/page-history/</code>.
              This view lets you compare the current page to any prior backup.
            </>
          }
          actions={
            <Link
              href={`/wiki/${params.slug}`}
              className="text-ui text-primary underline underline-offset-2 hover:text-primary/80"
            >
              ← Back to page
            </Link>
          }
        />

        {backups.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
            <p className="font-display text-h3 font-semibold">No backups yet</p>
            <p className="mx-auto mt-2 max-w-md text-ui text-muted-foreground">
              The first edit to this page (via the in-app editor, a lint quick-fix,
              or a re-ingest) will create a backup here.
            </p>
          </div>
        ) : (
          <HistoryDiffView
            slug={params.slug}
            currentContent={currentPage.content}
            currentTitle={currentPage.frontmatter.title}
            backups={backups}
            selectedFilename={selected?.filename ?? null}
            backupContent={backupContent}
          />
        )}
      </PageContainer>
    );
  } finally {
    ctx.db.close();
  }
}
