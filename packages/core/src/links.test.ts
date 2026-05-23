import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { upsertPage } from "./db-pages";
import { extractWikiLinks, findBacklinks, uniqueLinkedSlugs } from "./links";
import { initWikiFolder, writePage } from "./wiki";

describe("extractWikiLinks", () => {
  it("parses plain [[slug]] and [[slug|Display]] forms", () => {
    const refs = extractWikiLinks(
      "See [[shors-algorithm]] and [[peter-shor|Peter Shor].\n\nAlso [[bell-labs|Bell Labs]] notes.",
    );
    expect(refs.map((r) => r.slug)).toEqual(["shors-algorithm", "bell-labs"]);
    // The unclosed `]` in "[[peter-shor|Peter Shor]." prevents that one from matching.
    // Display text round-trips for valid forms.
    expect(refs[1]?.display).toBe("Bell Labs");
  });

  it("ignores invalid forms and capitalized slugs", () => {
    expect(extractWikiLinks("[[Bad-Slug]] [[also bad]] [normal](link)")).toEqual([]);
  });

  it("uniqueLinkedSlugs deduplicates", () => {
    const slugs = uniqueLinkedSlugs("[[a]] [[a]] [[b|B]] [[a]]");
    expect(Array.from(slugs).sort()).toEqual(["a", "b"]);
  });
});

describe("findBacklinks", () => {
  let wikiPath: string;
  let db: Db;

  beforeEach(async () => {
    wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-links-test-"));
    await initWikiFolder(wikiPath);
    db = openInMemoryDb();
  });

  afterEach(async () => {
    db.close();
    await rm(wikiPath, { recursive: true, force: true });
  });

  it("returns every page whose body links to the target slug", async () => {
    const pages: Array<{ slug: string; content: string; type: "concept" | "entity" }> = [
      { slug: "shors-algorithm", content: "About factoring.\n", type: "concept" },
      { slug: "peter-shor", content: "Discovered [[shors-algorithm]].\n", type: "entity" },
      { slug: "bell-labs", content: "Where [[peter-shor]] worked on [[shors-algorithm]].\n", type: "entity" },
      { slug: "grover-search", content: "Different quantum algorithm.\n", type: "concept" },
    ];
    for (const p of pages) {
      await writePage(wikiPath, {
        slug: p.slug,
        frontmatter: {
          title: p.slug,
          slug: p.slug,
          type: p.type,
          created: "2026-01-01",
          updated: "2026-01-01",
        },
        content: p.content,
      });
      upsertPage(db, {
        slug: p.slug,
        title: p.slug,
        type: p.type,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
        word_count: 5,
        tags: [],
      });
    }

    const backlinks = await findBacklinks(db, wikiPath, "shors-algorithm");
    expect(backlinks.map((b) => b.slug).sort()).toEqual(["bell-labs", "peter-shor"]);
    expect(backlinks.find((b) => b.slug === "peter-shor")?.excerpt).toContain("[[shors-algorithm]]");
  });

  it("returns an empty array when nothing links to the slug", async () => {
    await writePage(wikiPath, {
      slug: "orphan",
      frontmatter: {
        title: "Orphan",
        slug: "orphan",
        type: "concept",
        created: "2026-01-01",
        updated: "2026-01-01",
      },
      content: "No outbound links.\n",
    });
    upsertPage(db, {
      slug: "orphan",
      title: "Orphan",
      type: "concept",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      word_count: 3,
      tags: [],
    });
    expect(await findBacklinks(db, wikiPath, "orphan")).toEqual([]);
  });
});
