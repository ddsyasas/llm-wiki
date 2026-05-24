import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { getPage, searchPages, upsertPage, indexPageForSearch } from "./db-pages";
import {
  applyManualEdit,
  PageNotFoundError,
  PageRestoreConflictError,
  restoreDeletedPage,
  saveSchema,
  softDeletePage,
} from "./editor";
import { DEFAULT_SCHEMA_TEMPLATE } from "./templates";
import { initWikiFolder, readPage, readSchema, WIKI_PATHS, writePage } from "./wiki";

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-editor-test-"));
  await initWikiFolder(wikiPath);
  db = openInMemoryDb();
});

afterEach(async () => {
  db.close();
  await rm(wikiPath, { recursive: true, force: true });
});

async function seedPage(slug: string, content: string) {
  await writePage(wikiPath, {
    slug,
    frontmatter: {
      title: "Original Title",
      slug,
      type: "concept",
      created: "2026-01-15",
      updated: "2026-01-15",
      tags: ["original"],
    },
    content,
  });
  upsertPage(db, {
    slug,
    title: "Original Title",
    type: "concept",
    created_at: "2026-01-15",
    updated_at: "2026-01-15",
    word_count: content.split(/\s+/).length,
    tags: ["original"],
  });
  indexPageForSearch(db, { slug, title: "Original Title", content, tags: ["original"] });
}

describe("applyManualEdit", () => {
  it("backs up the prior file, updates content, preserves created/type, bumps updated", async () => {
    await seedPage("topic", "Original body text.\n");

    const r = await applyManualEdit(wikiPath, db, "topic", { content: "New body about [[other]].\n" });

    expect(r.backupPath).not.toBeNull();
    const histEntries = await readdir(join(wikiPath, WIKI_PATHS.tooling, "page-history"));
    expect(histEntries.some((f) => f.startsWith("topic-"))).toBe(true);
    const histBody = await readFile(histEntries[0] ? join(wikiPath, WIKI_PATHS.tooling, "page-history", histEntries[0]) : "", "utf8");
    expect(histBody).toContain("Original body text.");

    const after = await readPage(wikiPath, "topic");
    expect(after.content).toContain("New body about");
    expect(after.frontmatter.created).toBe("2026-01-15");
    expect(after.frontmatter.type).toBe("concept");
    expect(after.frontmatter.tags).toEqual(["original"]);
    expect(after.frontmatter.updated).not.toBe("2026-01-15");
  });

  it("optionally changes title, type, and tags via frontmatter patch", async () => {
    await seedPage("topic", "body\n");
    await applyManualEdit(wikiPath, db, "topic", {
      content: "new body\n",
      title: "Renamed",
      type: "entity",
      tags: ["a", "b"],
    });
    const after = await readPage(wikiPath, "topic");
    expect(after.frontmatter.title).toBe("Renamed");
    expect(after.frontmatter.type).toBe("entity");
    expect(after.frontmatter.tags).toEqual(["a", "b"]);
    expect(getPage(db, "topic")?.title).toBe("Renamed");
  });

  it("refreshes the FTS5 index so search picks up new content (and drops old)", async () => {
    await seedPage("topic", "Original mentions zeppelin.\n");
    expect(searchPages(db, "zeppelin").map((h) => h.slug)).toEqual(["topic"]);

    await applyManualEdit(wikiPath, db, "topic", { content: "Now about [[helicopter]] instead.\n" });
    expect(searchPages(db, "zeppelin")).toEqual([]);
    expect(searchPages(db, "helicopter").map((h) => h.slug)).toEqual(["topic"]);
  });

  it("appends an edit entry to log.md", async () => {
    await seedPage("topic", "body\n");
    await applyManualEdit(wikiPath, db, "topic", { content: "edited\n", title: "Hello" });
    const log = await readFile(join(wikiPath, WIKI_PATHS.log), "utf8");
    expect(log).toMatch(/## \[.*\] edit \| Hello \(topic\)/);
  });

  it("throws ENOENT-shaped error when slug does not exist", async () => {
    await expect(
      applyManualEdit(wikiPath, db, "ghost", { content: "x\n" }),
    ).rejects.toThrow();
  });
});

describe("saveSchema", () => {
  it("writes a new CLAUDE.md and backs up the prior version", async () => {
    // initWikiFolder seeded the default schema template
    const r = await saveSchema(wikiPath, "# Updated schema\n");
    expect(r.backupPath).not.toBeNull();
    expect(await readSchema(wikiPath)).toBe("# Updated schema\n");
    const histDir = join(wikiPath, WIKI_PATHS.tooling, "schema-history");
    const entries = await readdir(histDir);
    expect(entries.some((f) => f.startsWith("CLAUDE-"))).toBe(true);
    const backup = await readFile(join(histDir, entries[0]!), "utf8");
    expect(backup).toBe(DEFAULT_SCHEMA_TEMPLATE);
  });

  it("appends a schema log entry to log.md", async () => {
    await saveSchema(wikiPath, "# v2\n");
    const log = await readFile(join(wikiPath, WIKI_PATHS.log), "utf8");
    expect(log).toMatch(/## \[.*\] schema \| edited CLAUDE\.md/);
  });

  it("caps schema history at the last 10 backups", async () => {
    // Save 12 times; only 10 backups should remain after.
    for (let i = 0; i < 12; i++) {
      // Force monotonic timestamps so files sort in save order.
      await new Promise((r) => setTimeout(r, 5));
      await saveSchema(wikiPath, `# v${i}\n`);
    }
    const histDir = join(wikiPath, WIKI_PATHS.tooling, "schema-history");
    const entries = (await readdir(histDir)).filter((f) => f.startsWith("CLAUDE-"));
    expect(entries.length).toBe(10);
  });
});

describe("softDeletePage", () => {
  it("moves the file to trash, drops the DB row, returns trash info", async () => {
    await seedPage("doomed", "Body content here.\n");
    const r = await softDeletePage(wikiPath, db, "doomed");
    expect(r.slug).toBe("doomed");
    expect(r.trashFilename).toMatch(/-doomed\.md$/);
    expect(r.backlinkSlugs).toEqual([]);

    // File is no longer in wiki/, but is in trash/wiki/
    const wikiDir = await readdir(join(wikiPath, WIKI_PATHS.wiki));
    expect(wikiDir).not.toContain("doomed.md");
    const trashDir = await readdir(
      join(wikiPath, WIKI_PATHS.tooling, "trash", "wiki"),
    );
    expect(trashDir).toContain(r.trashFilename);

    // DB row is gone
    expect(getPage(db, "doomed")).toBeNull();
  });

  it("strips the deleted slug from index.md (preserves other entries)", async () => {
    await seedPage("alpha", "x");
    await seedPage("beta", "x");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(wikiPath, WIKI_PATHS.index),
      "# Wiki Index\n\n## Concepts\n- [[alpha]]: a\n- [[beta]]: b\n",
      "utf8",
    );
    await softDeletePage(wikiPath, db, "alpha");
    const out = await readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
    expect(out).not.toContain("[[alpha]]");
    expect(out).toContain("[[beta]]");
  });

  it("reports backlinks so the UI can warn the user before deleting", async () => {
    await seedPage("target", "I am about to be deleted.\n");
    await seedPage("linker1", "I link to [[target]].\n");
    await seedPage("linker2", "I also link to [[target]] here.\n");
    const r = await softDeletePage(wikiPath, db, "target");
    expect(r.backlinkSlugs.sort()).toEqual(["linker1", "linker2"]);
  });

  it("throws PageNotFoundError for an unknown slug", async () => {
    await expect(softDeletePage(wikiPath, db, "ghost")).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
  });

  it("removes the FTS5 entry so searches stop finding it", async () => {
    await seedPage("findable", "uniqueWord that appears nowhere else.\n");
    expect(searchPages(db, "uniqueWord")).toHaveLength(1);
    await softDeletePage(wikiPath, db, "findable");
    expect(searchPages(db, "uniqueWord")).toEqual([]);
  });
});

describe("restoreDeletedPage", () => {
  it("moves the trash file back, repopulates DB, returns the page", async () => {
    await seedPage("comeback", "Original body about [[other]].\n");
    const del = await softDeletePage(wikiPath, db, "comeback");
    const r = await restoreDeletedPage(wikiPath, db, "comeback", del.trashFilename);
    expect(r.slug).toBe("comeback");
    expect(r.page.content).toContain("Original body");

    // File is back in wiki/, not in trash
    const wikiDir = await readdir(join(wikiPath, WIKI_PATHS.wiki));
    expect(wikiDir).toContain("comeback.md");
    const trashDir = await readdir(
      join(wikiPath, WIKI_PATHS.tooling, "trash", "wiki"),
    ).catch(() => [] as string[]);
    expect(trashDir).not.toContain(del.trashFilename);

    // DB row is back
    expect(getPage(db, "comeback")?.title).toBe("Original Title");
  });

  it("refuses to clobber an existing page at the same slug", async () => {
    await seedPage("conflict", "Original.\n");
    const del = await softDeletePage(wikiPath, db, "conflict");
    // Recreate a page at the same slug
    await seedPage("conflict", "Different content now.\n");
    await expect(
      restoreDeletedPage(wikiPath, db, "conflict", del.trashFilename),
    ).rejects.toBeInstanceOf(PageRestoreConflictError);
  });

  it("rejects trash filenames that try to escape the trash dir", async () => {
    // Slug doesn't have an existing page (so we don't hit the conflict
    // check first). The path-escape check should fire.
    await expect(
      restoreDeletedPage(wikiPath, db, "nonexistent", "../etc/passwd"),
    ).rejects.toThrow(/must not contain path separators/);
  });

  it("re-adds the page to index.md", async () => {
    await seedPage("indexed", "First sentence to be the summary.\nLater paragraph.\n");
    const del = await softDeletePage(wikiPath, db, "indexed");
    await restoreDeletedPage(wikiPath, db, "indexed", del.trashFilename);
    const out = await readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
    expect(out).toContain("[[indexed]]");
  });
});
