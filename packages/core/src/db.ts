import { mkdirSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";

import { WIKI_PATHS } from "./wiki";

export type Db = Database.Database;

export const META_DB_FILENAME = "meta.sqlite";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT,
  format TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  ingested_at TEXT,
  url TEXT,
  title TEXT
);

CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  tags TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  slug UNINDEXED,
  title,
  content,
  tags
);

CREATE TABLE IF NOT EXISTS page_sources (
  page_slug TEXT NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY (page_slug, source_id),
  FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  folder TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_cents REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS response_cache (
  hash TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);
`;

export function runMigrations(db: Db): void {
  db.exec(SCHEMA_SQL);
}

function applyPragmas(db: Db): void {
  // FKs are off by default in SQLite. page_sources uses ON DELETE CASCADE.
  db.pragma("foreign_keys = ON");
  // WAL gives readers concurrent access to writers and is the right default
  // for a long-running local app. Harmless in tests (no-op on :memory:).
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
}

export function openDb(wikiPath: string): Db {
  const dir = join(wikiPath, WIKI_PATHS.tooling);
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, META_DB_FILENAME));
  applyPragmas(db);
  runMigrations(db);
  return db;
}

export function openInMemoryDb(): Db {
  const db = new Database(":memory:");
  applyPragmas(db);
  runMigrations(db);
  return db;
}
