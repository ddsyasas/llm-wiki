import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LlmClient } from "@llm-wiki/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { getPage, searchPages } from "./db-pages";
import { listSourceRows } from "./db-sources";
import { listUsageRows } from "./db-usage";
import { ingestPastedText, ingestSource } from "./ingest";
import type { IngestResponse } from "./schema";
import { initWikiFolder, readPage, WIKI_PATHS, writePage } from "./wiki";

function stubClient(responses: IngestResponse[]): LlmClient {
  const queue = [...responses];
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const next = queue.shift();
          if (!next) throw new Error("stub LLM: no canned response left");
          return {
            id: "stub",
            model: "stub/model",
            choices: [
              { index: 0, message: { role: "assistant", content: JSON.stringify(next) }, finish_reason: "stop" },
            ],
            usage: { prompt_tokens: 1200, completion_tokens: 380 },
          };
        }),
      },
    },
  } as unknown as LlmClient;
}

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-ingest-test-"));
  await initWikiFolder(wikiPath);
  db = openInMemoryDb();
});

afterEach(async () => {
  db.close();
  await rm(wikiPath, { recursive: true, force: true });
});

const sampleResponse: IngestResponse = {
  summary: "Two pages created about Shor's algorithm.",
  newPages: [
    {
      slug: "shors-algorithm",
      title: "Shor's Algorithm",
      type: "concept",
      content: "A quantum algorithm for [[integer-factorization]] discovered by [[peter-shor]].\n",
      tags: ["quantum", "algorithm"],
    },
    {
      slug: "peter-shor",
      title: "Peter Shor",
      type: "entity",
      content: "Mathematician who discovered [[shors-algorithm]] in 1994.\n",
      tags: ["quantum", "people"],
    },
  ],
  pageUpdates: [],
  indexEntries: [
    { slug: "shors-algorithm", category: "concepts", summary: "Quantum factoring algorithm." },
    { slug: "peter-shor", category: "entities", summary: "Mathematician at Bell Labs." },
  ],
  logEntry: "Created Shor's algorithm + Peter Shor pages.",
  contradictions: [],
};

describe("ingestSource (mocked LLM)", () => {
  it("writes new pages to disk, DB, FTS5, and the index", async () => {
    const client = stubClient([sampleResponse]);
    const result = await ingestSource({
      source: { content: "Shor's 1994 paper introduced...", title: "Shor 1994", format: "md" },
      wikiPath,
      db,
      client,
      model: "stub/model",
    });

    expect(result.newPages.map((p) => p.slug)).toEqual(["shors-algorithm", "peter-shor"]);

    // File system
    const shors = await readPage(wikiPath, "shors-algorithm");
    expect(shors.frontmatter.type).toBe("concept");
    expect(shors.content).toContain("[[integer-factorization]]");

    // DB
    expect(getPage(db, "shors-algorithm")?.title).toBe("Shor's Algorithm");
    expect(getPage(db, "peter-shor")?.type).toBe("entity");

    // FTS5
    expect(searchPages(db, "factorization").map((h) => h.slug)).toContain("shors-algorithm");

    // Index file
    const idx = await readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
    expect(idx).toContain("## Concepts");
    expect(idx).toContain("[[shors-algorithm]]");
    expect(idx).toContain("## Entities");
    expect(idx).toContain("[[peter-shor]]");

    // Log entry
    const log = await readFile(join(wikiPath, WIKI_PATHS.log), "utf8");
    expect(log).toMatch(/## \[\d{4}-\d{2}-\d{2}.* ingest \| Shor 1994 \(md\)/);
    expect(log).toContain("created pages: shors-algorithm, peter-shor");

    // Usage
    expect(listUsageRows(db).map((u) => u.operation)).toEqual(["ingest"]);
  });

  it("updates an existing page and creates a backup in .llm-wiki/page-history/", async () => {
    await writePage(wikiPath, {
      slug: "shors-algorithm",
      frontmatter: {
        title: "Shor's Algorithm",
        slug: "shors-algorithm",
        type: "concept",
        created: "2026-04-15",
        updated: "2026-04-15",
        tags: ["quantum"],
      },
      content: "Original short description.\n",
    });

    const updateResponse: IngestResponse = {
      summary: "Extended Shor's page.",
      newPages: [],
      pageUpdates: [
        {
          slug: "shors-algorithm",
          content: "Greatly extended description with more context about [[bell-labs]].\n",
          updateReason: "added context",
        },
      ],
      indexEntries: [
        { slug: "shors-algorithm", category: "concepts", summary: "Quantum factoring." },
      ],
      logEntry: "Extended Shor's algorithm.",
      contradictions: [],
    };

    const client = stubClient([updateResponse]);
    await ingestSource({
      source: { content: "more depth", title: "Extension", format: "md" },
      wikiPath,
      db,
      client,
      model: "stub/model",
    });

    const after = await readPage(wikiPath, "shors-algorithm");
    expect(after.content).toContain("Greatly extended description");
    expect(after.frontmatter.created).toBe("2026-04-15"); // preserved
    expect(after.frontmatter.updated).not.toBe("2026-04-15"); // bumped

    const histDir = join(wikiPath, WIKI_PATHS.tooling, "page-history");
    const histEntries = await readdir(histDir);
    expect(histEntries.some((f) => f.startsWith("shors-algorithm-"))).toBe(true);
  });

  it("promotes a hallucinated update slug into a new page (no data loss)", async () => {
    const hallucination: IngestResponse = {
      summary: "Updates an entity that does not exist yet.",
      newPages: [],
      pageUpdates: [
        {
          slug: "nonexistent-thing",
          content: "Some body text the LLM wrote.\n",
          updateReason: "writing without a basis",
        },
      ],
      indexEntries: [
        { slug: "nonexistent-thing", category: "concepts", summary: "Hallucinated." },
      ],
      logEntry: "Hallucinated update.",
      contradictions: [],
    };

    const client = stubClient([hallucination]);
    await ingestSource({
      source: { content: "x", title: "Y", format: "md" },
      wikiPath,
      db,
      client,
      model: "stub/model",
    });

    const page = await readPage(wikiPath, "nonexistent-thing");
    expect(page.content).toContain("Some body text");
    expect(page.frontmatter.type).toBe("concept");
  });

  it("preserves previously-indexed pages when only some change", async () => {
    // First ingest: two pages.
    await ingestSource({
      source: { content: "x", title: "T1", format: "md" },
      wikiPath,
      db,
      client: stubClient([sampleResponse]),
      model: "stub/model",
    });

    const secondResponse: IngestResponse = {
      summary: "Adds bell-labs only.",
      newPages: [
        {
          slug: "bell-labs",
          title: "Bell Labs",
          type: "entity",
          content: "Research lab mentioned in [[shors-algorithm]].\n",
          tags: ["research"],
        },
      ],
      pageUpdates: [],
      indexEntries: [
        { slug: "bell-labs", category: "entities", summary: "Industrial research lab." },
      ],
      logEntry: "Added Bell Labs.",
      contradictions: [],
    };
    await ingestSource({
      source: { content: "x", title: "T2", format: "md" },
      wikiPath,
      db,
      client: stubClient([secondResponse]),
      model: "stub/model",
    });

    const idx = await readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
    // All three pages remain in the index after a partial-update ingest.
    expect(idx).toContain("[[shors-algorithm]]");
    expect(idx).toContain("[[peter-shor]]");
    expect(idx).toContain("[[bell-labs]]");
  });
});

describe("ingestPastedText", () => {
  it("saves to raw/, inserts a sources row, runs ingest, marks ingested_at", async () => {
    const client = stubClient([sampleResponse]);
    const r = await ingestPastedText({
      text: "Some pasted research notes about Shor.",
      title: "Shor notes",
      wikiPath,
      db,
      client,
      model: "stub/model",
    });

    expect(r.sourceId).toMatch(/[0-9a-f-]{36}/);
    expect(r.rawFilename).toMatch(/^\d{4}-\d{2}-\d{2}-shor-notes\.md$/);

    const rawFiles = await readdir(join(wikiPath, WIKI_PATHS.raw));
    expect(rawFiles).toContain(r.rawFilename);
    const rawContent = await readFile(join(wikiPath, WIKI_PATHS.raw, r.rawFilename), "utf8");
    expect(rawContent).toContain("# Shor notes");

    const sources = listSourceRows(db);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.title).toBe("Shor notes");
    expect(sources[0]?.ingested_at).not.toBeNull();

    // Sanity: pages actually exist
    const s = await stat(join(wikiPath, WIKI_PATHS.wiki, "shors-algorithm.md"));
    expect(s.isFile()).toBe(true);
  });

  it("derives a title from the first line when none is provided", async () => {
    const client = stubClient([sampleResponse]);
    const r = await ingestPastedText({
      text: "# My Untitled Note\n\nLots of body text.",
      wikiPath,
      db,
      client,
      model: "stub/model",
    });
    expect(r.rawFilename).toContain("my-untitled-note");
  });
});
