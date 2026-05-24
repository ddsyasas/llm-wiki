// Index file (`index.md`) is the catalog of every page, grouped by type.
// Three operations touch it: ingest merges LLM-fresh entries with existing
// ones; the editor's "Rebuild index" action regenerates it from disk when
// the file drifts (e.g., a page was created without an index entry); lint
// can spot missing entries.
//
// The render shape was previously private to ingest.ts. Lifted here so the
// rebuild action doesn't duplicate it.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Db } from "./db";
import { getPage, listPageRows } from "./db-pages";
import type { PageType } from "./types";
import { readPage, WIKI_PATHS, writeIndex } from "./wiki";

export type IndexEntry = { category: string; summary: string };

// Order here is the order they appear in index.md. Overviews first so the
// reader gets the wiki's high-level synthesis before drilling in.
export const CATEGORY_HEADINGS: ReadonlyArray<{ heading: string; key: string }> = [
  { heading: "Overviews", key: "overviews" },
  { heading: "Concepts", key: "concepts" },
  { heading: "Entities", key: "entities" },
  { heading: "Comparisons", key: "comparisons" },
  { heading: "Sources", key: "sources" },
];

// page.type is singular ("concept"); category keys are plural ("concepts").
// Map between them explicitly so we don't rely on naive pluralization.
const TYPE_TO_CATEGORY: Record<PageType, string> = {
  concept: "concepts",
  entity: "entities",
  comparison: "comparisons",
  source: "sources",
  overview: "overviews",
};

export function categoryForType(type: PageType): string {
  return TYPE_TO_CATEGORY[type];
}

export function parseIndexEntries(text: string): Map<string, IndexEntry> {
  const map = new Map<string, IndexEntry>();
  let currentKey: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      const heading = headingMatch[1]?.trim().toLowerCase() ?? "";
      const found = CATEGORY_HEADINGS.find((c) => c.heading.toLowerCase() === heading);
      currentKey = found?.key ?? null;
      continue;
    }
    const itemMatch = line.match(/^-\s+\[\[([a-z0-9-]+)(?:\|[^\]]*)?\]\]:\s*(.*)$/);
    if (itemMatch && currentKey) {
      const slug = itemMatch[1];
      const summary = itemMatch[2] ?? "";
      if (slug) map.set(slug, { category: currentKey, summary: summary.trim() });
    }
  }
  return map;
}

export function renderIndex(entries: Map<string, IndexEntry>): string {
  if (entries.size === 0) {
    return "# Wiki Index\n\n_No pages yet. Add a source to get started._\n";
  }
  const buckets = new Map<string, Array<{ slug: string; summary: string }>>();
  for (const [slug, e] of entries) {
    const list = buckets.get(e.category) ?? [];
    list.push({ slug, summary: e.summary });
    buckets.set(e.category, list);
  }
  for (const list of buckets.values()) list.sort((a, b) => a.slug.localeCompare(b.slug));

  const lines: string[] = ["# Wiki Index", ""];
  for (const { heading, key } of CATEGORY_HEADINGS) {
    const items = buckets.get(key);
    if (!items || items.length === 0) continue;
    lines.push(`## ${heading}`);
    for (const it of items) {
      const summary = it.summary.length > 0 ? `: ${it.summary}` : "";
      lines.push(`- [[${it.slug}]]${summary}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

// Lightweight first-sentence extraction. We don't need fancy NLP — the LLM
// already wrote the content; we just want one line for the index.
function firstSentence(body: string, maxChars = 120): string {
  // Strip frontmatter-style horizontal rules and leading headings.
  const cleaned = body
    .replace(/^\s*#+\s+.*$/gm, "") // drop headings
    .replace(/^\s*>.*$/gm, "") // drop blockquotes (e.g., contradiction callouts)
    .trim();
  // Take everything up to the first . / ! / ? / newline.
  const m = cleaned.match(/^([\s\S]*?[.!?])(?:\s|$)/);
  let sentence = m ? m[1]! : cleaned.split(/\n/)[0] ?? "";
  // Strip [[wikilink|display]] → display, [[wikilink]] → wikilink. Index lines
  // shouldn't carry nested brackets — they render noisily and don't add info.
  sentence = sentence
    .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([a-z0-9-]+)\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (sentence.length > maxChars) sentence = `${sentence.slice(0, maxChars - 1).trimEnd()}…`;
  return sentence;
}

export type RebuildIndexResult = {
  totalPages: number;
  added: string[];
  removed: string[];
};

/**
 * Rewrites index.md from the page files currently on disk.
 *
 * Behavior:
 * - Preserves the existing summary for any slug already in the index.
 * - For pages not in the index, generates a one-line summary from the body's
 *   first sentence.
 * - Drops index entries that no longer have a corresponding page file (orphan
 *   entries left over after a manual page deletion).
 * - Sorted alphabetically within each category by [[CATEGORY_HEADINGS]].
 *
 * Local-only — no LLM call, free to run. Safe to invoke after any structural
 * change to the wiki (manual deletes, lint fixes, etc.).
 */
export async function rebuildIndexFromPages(
  wikiPath: string,
  db: Db,
): Promise<RebuildIndexResult> {
  const indexPath = join(wikiPath, WIKI_PATHS.index);
  let existingText = "";
  try {
    existingText = await readFile(indexPath, "utf8");
  } catch {
    existingText = "";
  }
  const existing = parseIndexEntries(existingText);

  const pageRows = listPageRows(db);
  const liveSlugs = new Set(pageRows.map((p) => p.slug));

  const next = new Map<string, IndexEntry>();
  const added: string[] = [];

  for (const row of pageRows) {
    const category = categoryForType(row.type);
    const prev = existing.get(row.slug);
    if (prev && prev.summary.length > 0) {
      // Preserve the existing summary, but make sure category reflects the
      // page's current type in case it was edited.
      next.set(row.slug, { category, summary: prev.summary });
      continue;
    }
    // New or summary-less entry — read the file and grab a one-liner.
    let summary = "";
    try {
      const page = await readPage(wikiPath, row.slug);
      summary = firstSentence(page.content);
    } catch {
      summary = "";
    }
    next.set(row.slug, { category, summary });
    added.push(row.slug);
  }

  const removed: string[] = [];
  for (const slug of existing.keys()) {
    if (!liveSlugs.has(slug)) removed.push(slug);
  }

  await writeIndex(wikiPath, renderIndex(next));
  return { totalPages: pageRows.length, added, removed };
}

/**
 * Re-extracts the index entry for a single slug from the current page body
 * on disk. Use this after any page edit so index.md doesn't drift out of
 * sync with the underlying file. (Previously lint kept flagging "page X
 * says A but index entry for X says B" after a successful page fix because
 * the index summary was generated when the page still said B.)
 *
 * Safe to call on a slug that isn't in the DB or has no page file — it
 * just no-ops in those cases.
 */
export async function refreshIndexEntryForSlug(
  wikiPath: string,
  db: Db,
  slug: string,
): Promise<void> {
  const pageRow = getPage(db, slug);
  if (!pageRow) return;
  let page;
  try {
    page = await readPage(wikiPath, slug);
  } catch {
    return;
  }
  const summary = firstSentence(page.content);
  const category = categoryForType(pageRow.type);

  const indexPath = join(wikiPath, WIKI_PATHS.index);
  let existingText = "";
  try {
    existingText = await readFile(indexPath, "utf8");
  } catch {
    existingText = "";
  }
  const entries = parseIndexEntries(existingText);
  entries.set(slug, { category, summary });
  await writeIndex(wikiPath, renderIndex(entries));
}
