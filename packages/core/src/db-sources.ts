import type { Db } from "./db";
import { SOURCE_FORMATS, type SourceFormat, type SourceRow } from "./types";

type SourceRowDb = {
  id: string;
  filename: string;
  original_name: string | null;
  format: string;
  size_bytes: number;
  added_at: string;
  ingested_at: string | null;
  url: string | null;
  title: string | null;
};

function rowFromDb(r: SourceRowDb): SourceRow {
  if (!SOURCE_FORMATS.includes(r.format as SourceFormat)) {
    throw new Error(`sources.${r.id}: unknown format in DB: ${r.format}`);
  }
  return { ...r, format: r.format as SourceFormat };
}

export function insertSource(db: Db, source: SourceRow): void {
  db.prepare(
    `INSERT INTO sources (id, filename, original_name, format, size_bytes, added_at, ingested_at, url, title)
     VALUES (@id, @filename, @original_name, @format, @size_bytes, @added_at, @ingested_at, @url, @title)`,
  ).run(source);
}

export function updateSource(db: Db, source: SourceRow): void {
  const info = db
    .prepare(
      `UPDATE sources
         SET filename = @filename,
             original_name = @original_name,
             format = @format,
             size_bytes = @size_bytes,
             added_at = @added_at,
             ingested_at = @ingested_at,
             url = @url,
             title = @title
       WHERE id = @id`,
    )
    .run(source);
  if (info.changes === 0) {
    throw new Error(`updateSource: no row with id '${source.id}'`);
  }
}

export function getSource(db: Db, id: string): SourceRow | null {
  const row = db.prepare(`SELECT * FROM sources WHERE id = ?`).get(id) as SourceRowDb | undefined;
  return row ? rowFromDb(row) : null;
}

export function deleteSource(db: Db, id: string): void {
  db.prepare(`DELETE FROM sources WHERE id = ?`).run(id);
}

export function listSourceRows(db: Db): SourceRow[] {
  const rows = db
    .prepare(`SELECT * FROM sources ORDER BY added_at DESC`)
    .all() as SourceRowDb[];
  return rows.map(rowFromDb);
}
