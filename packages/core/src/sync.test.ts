import { mkdtemp, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { getPage, listPageRows, searchPages } from "./db-pages";
import { listSyncedPaths } from "./db-sync";
import { syncWikiToDb, watchWiki } from "./sync";
import type { Page } from "./types";
import { initWikiFolder, WIKI_PATHS, writePage } from "./wiki";

async function setupTmpWiki(): Promise<{ wikiPath: string; cleanup: () => Promise<void> }> {
  const wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-sync-test-"));
  await initWikiFolder(wikiPath);
  return {
    wikiPath,
    cleanup: () => rm(wikiPath, { recursive: true, force: true }),
  };
}

function samplePage(slug: string, overrides: Partial<Page["frontmatter"]> = {}): Page {
  return {
    slug,
    frontmatter: {
      title: `Page ${slug}`,
      slug,
      type: "concept",
      created: "2026-01-01",
      updated: "2026-01-01",
      ...overrides,
    },
    content: `Body of ${slug} mentioning [[other-page]].\n`,
  };
}

describe("syncWikiToDb (full scan)", () => {
  let wikiPath: string;
  let cleanup: () => Promise<void>;
  let db: Db;

  beforeEach(async () => {
    ({ wikiPath, cleanup } = await setupTmpWiki());
    db = openInMemoryDb();
  });

  afterEach(async () => {
    db.close();
    await cleanup();
  });

  it("returns an empty result on a wiki with no pages", async () => {
    const r = await syncWikiToDb(wikiPath, db);
    expect(r).toEqual({ added: [], updated: [], deleted: [], skipped: [], errors: [] });
    expect(listPageRows(db)).toEqual([]);
  });

  it("is tolerant when wiki/ directory is missing entirely", async () => {
    await rm(join(wikiPath, WIKI_PATHS.wiki), { recursive: true });
    const r = await syncWikiToDb(wikiPath, db);
    expect(r.added).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("adds new pages and indexes them for FTS5", async () => {
    await writePage(wikiPath, samplePage("alpha"));
    await writePage(wikiPath, samplePage("zeta"));

    const r = await syncWikiToDb(wikiPath, db);

    expect(r.added.sort()).toEqual(["alpha", "zeta"]);
    expect(r.updated).toEqual([]);
    expect(r.deleted).toEqual([]);
    expect(listPageRows(db).map((p) => p.slug)).toEqual(["alpha", "zeta"]);
    expect(searchPages(db, "other-page").map((h) => h.slug).sort()).toEqual(["alpha", "zeta"]);
  });

  it("skips files whose mtime + size are unchanged", async () => {
    await writePage(wikiPath, samplePage("alpha"));
    await syncWikiToDb(wikiPath, db);
    const second = await syncWikiToDb(wikiPath, db);
    expect(second.added).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.skipped).toEqual(["alpha"]);
  });

  it("re-syncs a file when its content (and mtime) change", async () => {
    await writePage(wikiPath, samplePage("alpha"));
    await syncWikiToDb(wikiPath, db);

    // Rewrite the file with new content and force a fresh mtime.
    await writePage(wikiPath, {
      ...samplePage("alpha"),
      content: "Completely new body talking about [[quantum-stuff]].\n",
    });
    const future = new Date(Date.now() + 60_000);
    await utimes(join(wikiPath, WIKI_PATHS.wiki, "alpha.md"), future, future);

    const r = await syncWikiToDb(wikiPath, db);
    expect(r.updated).toEqual(["alpha"]);
    expect(searchPages(db, "quantum-stuff").map((h) => h.slug)).toEqual(["alpha"]);
    expect(searchPages(db, "other-page")).toEqual([]); // old content gone
  });

  it("deletes DB rows for files removed from disk", async () => {
    await writePage(wikiPath, samplePage("alpha"));
    await writePage(wikiPath, samplePage("zeta"));
    await syncWikiToDb(wikiPath, db);

    await unlink(join(wikiPath, WIKI_PATHS.wiki, "alpha.md"));
    const r = await syncWikiToDb(wikiPath, db);

    expect(r.deleted).toEqual(["alpha"]);
    expect(getPage(db, "alpha")).toBeNull();
    expect(listSyncedPaths(db, "wiki/")).toEqual(["wiki/zeta.md"]);
    expect(searchPages(db, "other-page").map((h) => h.slug)).toEqual(["zeta"]);
  });

  it("records errors for malformed pages without aborting the run", async () => {
    await writePage(wikiPath, samplePage("good"));
    await writeFile(
      join(wikiPath, WIKI_PATHS.wiki, "bad.md"),
      "no frontmatter here at all\n",
      "utf8",
    );

    const r = await syncWikiToDb(wikiPath, db);
    expect(r.added).toEqual(["good"]);
    expect(r.errors.map((e) => e.slug)).toEqual(["bad"]);
    expect(getPage(db, "good")?.title).toBe("Page good");
    expect(getPage(db, "bad")).toBeNull();
  });
});

describe("watchWiki (chokidar live watch)", () => {
  let wikiPath: string;
  let cleanup: () => Promise<void>;
  let db: Db;

  beforeEach(async () => {
    ({ wikiPath, cleanup } = await setupTmpWiki());
    db = openInMemoryDb();
  });

  afterEach(async () => {
    db.close();
    await cleanup();
  });

  it("picks up a new file added while the watcher is running", async () => {
    const events: Array<{ added: string[]; updated: string[]; deleted: string[] }> = [];
    const watcher = watchWiki(wikiPath, db, {
      onChange: (d) => events.push({ added: d.added, updated: d.updated, deleted: d.deleted }),
    });
    await watcher.ready;

    await writePage(wikiPath, samplePage("live-add"));

    // Poll up to ~3s for the event to land. Chokidar timing varies by OS.
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (events.some((e) => e.added.includes("live-add"))) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    await watcher.stop();
    expect(events.some((e) => e.added.includes("live-add"))).toBe(true);
    expect(getPage(db, "live-add")?.title).toBe("Page live-add");
  }, 10_000);

  it("removes a page from the DB when its file is deleted", async () => {
    await writePage(wikiPath, samplePage("doomed"));
    await syncWikiToDb(wikiPath, db);
    expect(getPage(db, "doomed")).not.toBeNull();

    const events: string[][] = [];
    const watcher = watchWiki(wikiPath, db, { onChange: (d) => events.push(d.deleted) });
    await watcher.ready;

    await unlink(join(wikiPath, WIKI_PATHS.wiki, "doomed.md"));

    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (events.some((d) => d.includes("doomed"))) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    await watcher.stop();
    expect(events.some((d) => d.includes("doomed"))).toBe(true);
    expect(getPage(db, "doomed")).toBeNull();
  }, 10_000);
});
