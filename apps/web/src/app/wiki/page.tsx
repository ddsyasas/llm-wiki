import Link from "next/link";

import { listPageRows, readIndex } from "@llm-wiki/core";

import { MarkdownView } from "@/components/wiki/markdown-view";
import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export default async function WikiIndexPage() {
  const ctx = await openWikiContext();
  let indexMd = "";
  let knownSlugs: string[] = [];
  let pageCount = 0;
  try {
    indexMd = await readIndex(ctx.wikiPath).catch(
      () => "# Wiki Index\n\n_No pages yet. Add a source to get started._\n",
    );
    const rows = listPageRows(ctx.db);
    knownSlugs = rows.map((r) => r.slug);
    pageCount = rows.length;
  } finally {
    ctx.db.close();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-baseline justify-between border-b border-border pb-4">
        <h1 className="text-3xl font-semibold tracking-tight">Wiki Index</h1>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {pageCount} page{pageCount === 1 ? "" : "s"}
        </p>
      </header>

      {pageCount === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Your wiki is empty. Head to{" "}
            <Link href="/sources" className="text-primary underline underline-offset-2">
              Sources
            </Link>{" "}
            to paste your first text and watch the LLM build pages.
          </p>
        </div>
      ) : (
        <MarkdownView content={indexMd} knownSlugs={knownSlugs} />
      )}

      <p className="mt-10 text-xs text-muted-foreground">
        Wiki folder: <code className="break-all">{ctx.wikiPath}</code>
      </p>
    </main>
  );
}
