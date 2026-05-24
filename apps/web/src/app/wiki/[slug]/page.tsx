import { notFound } from "next/navigation";

import {
  findBacklinks,
  getSource,
  listPageRows,
  listSourceIdsForPage,
  readPage,
} from "@llm-wiki/core";

import { PageView } from "@/components/wiki/page-view";
import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export default async function WikiSlugPage({ params }: { params: { slug: string } }) {
  const ctx = await openWikiContext();
  try {
    let page;
    try {
      page = await readPage(ctx.wikiPath, params.slug);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") notFound();
      throw err;
    }
    const [backlinks, allRows] = await Promise.all([
      findBacklinks(ctx.db, ctx.wikiPath, params.slug),
      Promise.resolve(listPageRows(ctx.db)),
    ]);
    const knownSlugs = allRows.map((r) => r.slug);

    // Pull the source rows that contributed to this page. Surfaces the raw
    // lineage so the reader can answer "where did this claim come from?"
    // without leaving the wiki.
    const sourceIds = listSourceIdsForPage(ctx.db, params.slug);
    const sources = sourceIds.flatMap((id) => {
      const row = getSource(ctx.db, id);
      if (!row) return [];
      return [
        {
          id: row.id,
          title: row.title?.trim() || row.original_name?.trim() || row.filename,
          format: row.format as string,
        },
      ];
    });

    return (
      <PageView
        slug={page.slug}
        title={page.frontmatter.title}
        type={page.frontmatter.type}
        created={page.frontmatter.created}
        updated={page.frontmatter.updated}
        tags={page.frontmatter.tags ?? []}
        content={page.content}
        backlinks={backlinks}
        knownSlugs={knownSlugs}
        sources={sources}
      />
    );
  } finally {
    ctx.db.close();
  }
}
