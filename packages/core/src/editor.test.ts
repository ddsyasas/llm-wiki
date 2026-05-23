import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { getPage, searchPages, upsertPage, indexPageForSearch } from "./db-pages";
import { applyManualEdit, saveSchema } from "./editor";
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
