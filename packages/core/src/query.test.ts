import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LlmClient } from "@llm-wiki/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { indexPageForSearch, upsertPage } from "./db-pages";
import { listUsageRows } from "./db-usage";
import { createPage, PageAlreadyExistsError } from "./editor";
import { queryWiki } from "./query";
import type { QueryResponse } from "./schema";
import { initWikiFolder, readPage, writePage } from "./wiki";

function stubClient(responses: QueryResponse[]): LlmClient {
  const queue = [...responses];
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const next = queue.shift();
          if (!next) throw new Error("stub LLM: no canned response left");
          return {
            id: "stub",
            model: "stub/sonnet",
            choices: [
              { index: 0, message: { role: "assistant", content: JSON.stringify(next) }, finish_reason: "stop" },
            ],
            usage: { prompt_tokens: 2500, completion_tokens: 320 },
          };
        }),
      },
    },
  } as unknown as LlmClient;
}

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-query-test-"));
  await initWikiFolder(wikiPath);
  db = openInMemoryDb();
});

afterEach(async () => {
  db.close();
  await rm(wikiPath, { recursive: true, force: true });
});

async function seed(slug: string, title: string, body: string) {
  await writePage(wikiPath, {
    slug,
    frontmatter: {
      title,
      slug,
      type: "concept",
      created: "2026-01-01",
      updated: "2026-01-01",
    },
    content: body,
  });
  upsertPage(db, {
    slug,
    title,
    type: "concept",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    word_count: body.split(/\s+/).length,
    tags: [],
  });
  indexPageForSearch(db, { slug, title, content: body, tags: [] });
}

describe("queryWiki", () => {
  it("returns the LLM's parsed answer and records usage", async () => {
    await seed("shors-algorithm", "Shor's Algorithm", "Quantum factoring in polynomial time.");

    const response: QueryResponse = {
      answer: "[[shors-algorithm]] factors integers in polynomial time.",
      pagesUsed: ["shors-algorithm"],
      suggestedNewPage: null,
      confidence: "high",
      caveats: [],
    };
    const client = stubClient([response]);

    const r = await queryWiki({
      question: "What is Shor's algorithm?",
      wikiPath,
      db,
      client,
      model: "stub/sonnet",
    });

    expect(r.answer).toContain("[[shors-algorithm]]");
    expect(r.pagesUsed).toEqual(["shors-algorithm"]);
    expect(r.confidence).toBe("high");

    const usage = listUsageRows(db);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.operation).toBe("query");
  });

  it("includes a suggested new page when the LLM proposes one", async () => {
    const response: QueryResponse = {
      answer: "I'd want a dedicated page for this.",
      pagesUsed: [],
      suggestedNewPage: {
        slug: "quantum-error-correction",
        title: "Quantum Error Correction",
        content: "Overview of QEC schemes.\n",
        reason: "Frequently referenced; worth a standalone page.",
      },
      confidence: "medium",
      caveats: ["The wiki only covers Shor's algorithm so far."],
    };
    const client = stubClient([response]);

    const r = await queryWiki({
      question: "How does QEC fit in?",
      wikiPath,
      db,
      client,
      model: "stub/sonnet",
    });

    expect(r.suggestedNewPage?.slug).toBe("quantum-error-correction");
    expect(r.caveats).toHaveLength(1);
  });

  it("rejects an empty question", async () => {
    const client = stubClient([
      {
        answer: "",
        pagesUsed: [],
        suggestedNewPage: null,
        confidence: "low",
        caveats: [],
      },
    ]);
    await expect(
      queryWiki({ question: "", wikiPath, db, client, model: "stub/sonnet" }),
    ).rejects.toThrow(/non-empty/);
  });
});

describe("createPage", () => {
  it("writes a new page with frontmatter, DB row, FTS5 index, and log entry", async () => {
    const page = await createPage(wikiPath, db, {
      slug: "new-concept",
      title: "New Concept",
      type: "concept",
      content: "Body referring to [[other-page]].",
      tags: ["promoted"],
    });

    expect(page.frontmatter.title).toBe("New Concept");
    expect(page.frontmatter.tags).toEqual(["promoted"]);

    const round = await readPage(wikiPath, "new-concept");
    expect(round.content).toContain("[[other-page]]");
  });

  it("throws PageAlreadyExistsError when slug already exists", async () => {
    await createPage(wikiPath, db, {
      slug: "dup",
      title: "Dup",
      type: "concept",
      content: "first",
    });
    await expect(
      createPage(wikiPath, db, {
        slug: "dup",
        title: "Dup 2",
        type: "concept",
        content: "second",
      }),
    ).rejects.toBeInstanceOf(PageAlreadyExistsError);
  });
});
