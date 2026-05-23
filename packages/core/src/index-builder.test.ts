import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { indexPageForSearch, upsertPage } from "./db-pages";
import {
  categoryForType,
  parseIndexEntries,
  rebuildIndexFromPages,
  renderIndex,
} from "./index-builder";
import type { PageType } from "./types";
import { initWikiFolder, writePage, WIKI_PATHS } from "./wiki";

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-index-test-"));
  await initWikiFolder(wikiPath);
  db = openInMemoryDb();
});

afterEach(async () => {
  db.close();
  await rm(wikiPath, { recursive: true, force: true });
});

async function seed(slug: string, title: string, body: string, type: PageType = "concept") {
  await writePage(wikiPath, {
    slug,
    frontmatter: {
      title,
      slug,
      type,
      created: "2026-01-01",
      updated: "2026-01-01",
    },
    content: body,
  });
  upsertPage(db, {
    slug,
    title,
    type,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    word_count: body.split(/\s+/).length,
    tags: [],
  });
  indexPageForSearch(db, { slug, title, content: body, tags: [] });
}

describe("categoryForType", () => {
  it("maps every singular page type to its plural index category", () => {
    expect(categoryForType("concept")).toBe("concepts");
    expect(categoryForType("entity")).toBe("entities");
    expect(categoryForType("comparison")).toBe("comparisons");
    expect(categoryForType("source")).toBe("sources");
    expect(categoryForType("overview")).toBe("overviews");
  });
});

describe("parseIndexEntries + renderIndex round-trip", () => {
  it("survives a parse → render cycle without drift", () => {
    const original = [
      "# Wiki Index",
      "",
      "## Concepts",
      "- [[alpha]]: first concept",
      "- [[beta]]: second concept",
      "",
      "## Entities",
      "- [[zeta]]: an entity",
      "",
    ].join("\n");
    const parsed = parseIndexEntries(original);
    expect(parsed.size).toBe(3);
    expect(parsed.get("alpha")).toEqual({ category: "concepts", summary: "first concept" });
    const rendered = renderIndex(parsed);
    // Re-parse to assert content equivalence (whitespace is normalized).
    const reparsed = parseIndexEntries(rendered);
    expect(reparsed).toEqual(parsed);
  });

  it("renders the empty-wiki placeholder for an empty entry map", () => {
    const out = renderIndex(new Map());
    expect(out).toContain("No pages yet");
  });
});

describe("rebuildIndexFromPages", () => {
  it("preserves existing summaries and adds entries for pages missing from the index", async () => {
    // Seed three pages on disk, but only put one in the existing index.
    await seed("alpha", "Alpha", "First sentence about alpha. Second sentence.", "concept");
    await seed("beta", "Beta", "Bee body content here.", "concept");
    await seed("zeta", "Zeta", "Some entity body.", "entity");
    // Hand-write an index that only knows about alpha (with a custom summary).
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(wikiPath, WIKI_PATHS.index),
      "# Wiki Index\n\n## Concepts\n- [[alpha]]: hand-tuned summary worth keeping\n",
      "utf8",
    );

    const result = await rebuildIndexFromPages(wikiPath, db);
    expect(result.totalPages).toBe(3);
    expect(result.added.sort()).toEqual(["beta", "zeta"]);
    expect(result.removed).toEqual([]);

    const out = await readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
    expect(out).toContain("[[alpha]]: hand-tuned summary worth keeping");
    expect(out).toContain("[[beta]]");
    expect(out).toContain("[[zeta]]");
    expect(out).toContain("## Concepts");
    expect(out).toContain("## Entities");
  });

  it("removes index entries that no longer have a page file", async () => {
    await seed("alpha", "Alpha", "Body.", "concept");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(wikiPath, WIKI_PATHS.index),
      [
        "# Wiki Index",
        "",
        "## Concepts",
        "- [[alpha]]: still here",
        "- [[deleted]]: orphan entry",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await rebuildIndexFromPages(wikiPath, db);
    expect(result.removed).toEqual(["deleted"]);
    const out = await readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
    expect(out).not.toContain("deleted");
    expect(out).toContain("[[alpha]]");
  });

  it("generates a one-line summary from the page body when none exists", async () => {
    await seed("solo", "Solo", "# Solo\n\nA pithy single-sentence definition. Then a longer paragraph that should not show up.", "concept");

    await rebuildIndexFromPages(wikiPath, db);
    const out = await readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
    expect(out).toContain("A pithy single-sentence definition.");
    expect(out).not.toContain("longer paragraph");
  });

  it("strips [[wikilinks]] in generated summaries", async () => {
    await seed(
      "linker",
      "Linker",
      "References [[other]] and [[third|the third]] inline.",
      "concept",
    );
    await rebuildIndexFromPages(wikiPath, db);
    const out = await readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
    // The generated summary line should NOT contain [[ or ]].
    const linkerLine = out.split("\n").find((l) => l.includes("[[linker]]"))!;
    expect(linkerLine).toContain("[[linker]]"); // the slug itself is the link
    const afterColon = linkerLine.split(":").slice(1).join(":");
    expect(afterColon).not.toContain("[[");
  });
});
