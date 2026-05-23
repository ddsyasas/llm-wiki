import type { Db } from "./db";
import { listPageRows } from "./db-pages";
import { readPage } from "./wiki";

// Matches [[slug]] and [[slug|Display Name]]. Slugs are kebab-case per docs/03.
const WIKILINK_RE = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

export type WikiLinkRef = {
  slug: string;
  display: string;
};

/** Extracts every [[wikilink]] reference from a page body, preserving order. */
export function extractWikiLinks(content: string): WikiLinkRef[] {
  const out: WikiLinkRef[] = [];
  for (const match of content.matchAll(WIKILINK_RE)) {
    const slug = match[1];
    const display = match[2]?.trim();
    if (!slug) continue;
    out.push({ slug, display: display && display.length > 0 ? display : slug });
  }
  return out;
}

/** Set of distinct slugs referenced in the content. */
export function uniqueLinkedSlugs(content: string): Set<string> {
  const set = new Set<string>();
  for (const ref of extractWikiLinks(content)) set.add(ref.slug);
  return set;
}

export type Backlink = {
  slug: string;
  title: string;
  excerpt: string;
};

/**
 * Finds every page whose body links to the given slug.
 *
 * V1 implementation scans the wiki/ folder directly. Acceptable for the
 * personal-wiki scale we target (hundreds of pages). If perf becomes an
 * issue we can introduce a `page_links` table updated on each write.
 */
export async function findBacklinks(
  db: Db,
  wikiPath: string,
  targetSlug: string,
): Promise<Backlink[]> {
  const target = targetSlug.toLowerCase();
  const rows = listPageRows(db);
  const results: Backlink[] = [];

  for (const row of rows) {
    if (row.slug === target) continue;
    let page;
    try {
      page = await readPage(wikiPath, row.slug);
    } catch {
      continue; // page deleted between listing and read; skip
    }
    const linked = uniqueLinkedSlugs(page.content);
    if (!linked.has(target)) continue;
    results.push({
      slug: row.slug,
      title: page.frontmatter.title,
      excerpt: excerptAround(page.content, target),
    });
  }

  return results.sort((a, b) => a.title.localeCompare(b.title));
}

function excerptAround(content: string, slug: string): string {
  const idx = content.toLowerCase().indexOf(`[[${slug}`);
  if (idx === -1) return content.slice(0, 160);
  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, idx + 160);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}
