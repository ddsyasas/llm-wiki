import type { Db } from "./db";
import { PAGE_TYPES, type PageRow, type PageType } from "./types";

type PageRowDb = {
  slug: string;
  title: string;
  type: string;
  created_at: string;
  updated_at: string;
  word_count: number;
  tags: string | null;
};

function rowFromDb(r: PageRowDb): PageRow {
  if (!PAGE_TYPES.includes(r.type as PageType)) {
    throw new Error(`pages.${r.slug}: unknown type in DB: ${r.type}`);
  }
  return {
    slug: r.slug,
    title: r.title,
    type: r.type as PageType,
    created_at: r.created_at,
    updated_at: r.updated_at,
    word_count: r.word_count,
    tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
  };
}

export function insertPage(db: Db, page: PageRow): void {
  db.prepare(
    `INSERT INTO pages (slug, title, type, created_at, updated_at, word_count, tags)
     VALUES (@slug, @title, @type, @created_at, @updated_at, @word_count, @tags)`,
  ).run({ ...page, tags: JSON.stringify(page.tags) });
}

export function updatePage(db: Db, page: PageRow): void {
  const info = db
    .prepare(
      `UPDATE pages
         SET title = @title,
             type = @type,
             created_at = @created_at,
             updated_at = @updated_at,
             word_count = @word_count,
             tags = @tags
       WHERE slug = @slug`,
    )
    .run({ ...page, tags: JSON.stringify(page.tags) });
  if (info.changes === 0) {
    throw new Error(`updatePage: no row with slug '${page.slug}'`);
  }
}

export function upsertPage(db: Db, page: PageRow): void {
  db.prepare(
    `INSERT INTO pages (slug, title, type, created_at, updated_at, word_count, tags)
     VALUES (@slug, @title, @type, @created_at, @updated_at, @word_count, @tags)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       type = excluded.type,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       word_count = excluded.word_count,
       tags = excluded.tags`,
  ).run({ ...page, tags: JSON.stringify(page.tags) });
}

export function getPage(db: Db, slug: string): PageRow | null {
  const row = db.prepare(`SELECT * FROM pages WHERE slug = ?`).get(slug) as PageRowDb | undefined;
  return row ? rowFromDb(row) : null;
}

export function deletePage(db: Db, slug: string): void {
  db.prepare(`DELETE FROM pages WHERE slug = ?`).run(slug);
}

export function listPageRows(db: Db): PageRow[] {
  const rows = db.prepare(`SELECT * FROM pages ORDER BY slug`).all() as PageRowDb[];
  return rows.map(rowFromDb);
}

// ---- page <-> source link table -------------------------------------------

export function linkPageSource(db: Db, pageSlug: string, sourceId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO page_sources (page_slug, source_id) VALUES (?, ?)`,
  ).run(pageSlug, sourceId);
}

export function unlinkPageSource(db: Db, pageSlug: string, sourceId: string): void {
  db.prepare(`DELETE FROM page_sources WHERE page_slug = ? AND source_id = ?`).run(
    pageSlug,
    sourceId,
  );
}

export function listSourceIdsForPage(db: Db, pageSlug: string): string[] {
  const rows = db
    .prepare(`SELECT source_id FROM page_sources WHERE page_slug = ? ORDER BY source_id`)
    .all(pageSlug) as Array<{ source_id: string }>;
  return rows.map((r) => r.source_id);
}

// ---- FTS5 -----------------------------------------------------------------

export function indexPageForSearch(
  db: Db,
  args: { slug: string; title: string; content: string; tags: string[] },
): void {
  // Delete any prior row for the slug, then insert. FTS5 doesn't have a real
  // upsert path; this is the documented pattern.
  db.prepare(`DELETE FROM pages_fts WHERE slug = ?`).run(args.slug);
  db.prepare(
    `INSERT INTO pages_fts (slug, title, content, tags) VALUES (?, ?, ?, ?)`,
  ).run(args.slug, args.title, args.content, args.tags.join(" "));
}

export function unindexPageFromSearch(db: Db, slug: string): void {
  db.prepare(`DELETE FROM pages_fts WHERE slug = ?`).run(slug);
}

export type SearchHit = { slug: string; title: string; snippet: string };

// FTS5 treats hyphens, colons, parens, etc. as operators. For a personal
// search box we want plain word/phrase matching, so split on whitespace and
// quote each token. Boolean operators aren't exposed in V1.
function sanitizeFtsQuery(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok.replace(/"/g, '""')}"`)
    .join(" ");
}

export function searchPages(db: Db, query: string, limit = 20): SearchHit[] {
  const sanitized = sanitizeFtsQuery(query);
  if (sanitized.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT slug, title, snippet(pages_fts, 2, '[', ']', '...', 16) AS snippet
         FROM pages_fts
        WHERE pages_fts MATCH ?
        ORDER BY rank
        LIMIT ?`,
    )
    .all(sanitized, limit) as SearchHit[];
  return rows;
}
