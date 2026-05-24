import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { indexPageForSearch, upsertPage } from "./db-pages";
import { buildGraph } from "./graph";
import type { PageType } from "./types";
import { initWikiFolder, writePage } from "./wiki";

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-graph-test-"));
  await initWikiFolder(wikiPath);
  db = openInMemoryDb();
});

afterEach(async () => {
  db.close();
  await rm(wikiPath, { recursive: true, force: true });
});

async function seed(
  slug: string,
  title: string,
  body: string,
  type: PageType = "concept",
  tags: string[] = [],
) {
  await writePage(wikiPath, {
    slug,
    frontmatter: {
      title,
      slug,
      type,
      created: "2026-01-01",
      updated: "2026-01-01",
      ...(tags.length > 0 ? { tags } : {}),
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
    tags,
  });
  indexPageForSearch(db, { slug, title, content: body, tags });
}

describe("buildGraph", () => {
  it("returns empty data for an empty wiki", async () => {
    const g = await buildGraph(wikiPath, db);
    expect(g.nodes).toEqual([]);
    expect(g.links).toEqual([]);
  });

  it("produces one node with degree 0 for a single page with no links", async () => {
    await seed("alpha", "Alpha", "Just some prose here. No links at all.");
    const g = await buildGraph(wikiPath, db);
    expect(g.nodes).toHaveLength(1);
    expect(g.links).toEqual([]);
    expect(g.nodes[0]?.id).toBe("alpha");
    expect(g.nodes[0]?.degree).toBe(0);
    expect(g.nodes[0]?.title).toBe("Alpha");
  });

  it("draws edges between linked pages and sums degree on both ends", async () => {
    await seed("alpha", "Alpha", "Links to [[beta]].");
    await seed("beta", "Beta", "Links to [[alpha]] in return.");
    const g = await buildGraph(wikiPath, db);
    expect(g.nodes).toHaveLength(2);
    expect(g.links).toHaveLength(2);
    const alpha = g.nodes.find((n) => n.id === "alpha")!;
    const beta = g.nodes.find((n) => n.id === "beta")!;
    expect(alpha.degree).toBe(2); // one outbound, one inbound
    expect(beta.degree).toBe(2);
  });

  it("drops broken links to non-existent slugs (lint's job to surface)", async () => {
    await seed("alpha", "Alpha", "Links to [[bogus-slug]] which doesn't exist.");
    const g = await buildGraph(wikiPath, db);
    expect(g.nodes).toHaveLength(1);
    expect(g.links).toEqual([]);
    expect(g.nodes[0]?.degree).toBe(0);
  });

  it("drops self-links so no node has an edge to itself", async () => {
    await seed("alpha", "Alpha", "Refers to itself via [[alpha]] which should be ignored.");
    const g = await buildGraph(wikiPath, db);
    expect(g.links).toEqual([]);
    expect(g.nodes[0]?.degree).toBe(0);
  });

  it("dedupes when the same target is linked multiple times in one page", async () => {
    await seed("alpha", "Alpha", "Mentions [[beta]] here. And again [[beta]] there.");
    await seed("beta", "Beta", "No outbound links.");
    const g = await buildGraph(wikiPath, db);
    expect(g.links).toHaveLength(1);
    expect(g.nodes.find((n) => n.id === "alpha")?.degree).toBe(1);
    expect(g.nodes.find((n) => n.id === "beta")?.degree).toBe(1);
  });

  it("strips wikilink brackets from preview text", async () => {
    await seed(
      "alpha",
      "Alpha",
      "Quick definition. Then a [[beta|display name]] reference and [[gamma]] inline.",
    );
    await seed("beta", "Beta", "x");
    await seed("gamma", "Gamma", "x");
    const g = await buildGraph(wikiPath, db);
    const alpha = g.nodes.find((n) => n.id === "alpha")!;
    expect(alpha.preview).not.toContain("[[");
    expect(alpha.preview).toContain("display name");
    expect(alpha.preview).toContain("gamma");
  });
});
