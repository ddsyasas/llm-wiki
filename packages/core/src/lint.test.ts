import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LlmClient } from "@llm-wiki/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { indexPageForSearch, upsertPage } from "./db-pages";
import { removeBrokenLink } from "./editor";
import { lintWiki } from "./lint";
import type { LintResponse } from "./schema";
import { initWikiFolder, readPage, writePage } from "./wiki";

function stubClient(responses: LintResponse[]): LlmClient {
  const queue = [...responses];
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const next = queue.shift();
          if (!next) throw new Error("stub LLM: no canned response left");
          return {
            id: "stub",
            model: "stub/lint",
            choices: [
              { index: 0, message: { role: "assistant", content: JSON.stringify(next) }, finish_reason: "stop" },
            ],
            usage: { prompt_tokens: 3500, completion_tokens: 400 },
          };
        }),
      },
    },
  } as unknown as LlmClient;
}

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-lint-test-"));
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
  type: "concept" | "entity" | "overview" = "concept",
) {
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

const noopLlmResponse: LintResponse = {
  issues: [],
  suggestedQuestions: [],
  overallHealth: "good",
};

describe("lintWiki — local checks", () => {
  it("returns an empty-but-healthy result on an empty wiki without calling the LLM", async () => {
    const create = vi.fn();
    const client = { chat: { completions: { create } } } as unknown as LlmClient;
    const r = await lintWiki({ wikiPath, db, client, model: "stub/lint" });
    expect(r.issues).toEqual([]);
    expect(r.overallHealth).toBe("excellent");
    expect(create).not.toHaveBeenCalled();
  });

  it("flags broken-link issues for every [[slug]] that doesn't exist", async () => {
    await seed("a", "A", "Links to [[bogus-slug]] and [[also-missing]].");
    await seed("b", "B", "Links to [[a]] — fine.");
    const r = await lintWiki({
      wikiPath,
      db,
      client: stubClient([noopLlmResponse]),
      model: "stub/lint",
    });
    const broken = r.issues.filter((i) => i.type === "broken-link");
    expect(broken).toHaveLength(2);
    expect(broken.every((b) => b.source === "local")).toBe(true);
    expect(broken.map((b) => b.affectedPages[0])).toEqual(["a", "a"]);
  });

  it("flags orphans but skips overview pages", async () => {
    await seed("a", "A", "Standalone with no inbound or outbound links.");
    await seed("b", "B", "Links to [[a]]."); // so 'a' is no longer orphan
    await seed("c", "C", "Unlinked.");
    await seed("home", "Home", "Welcome.", "overview"); // also unlinked but overview
    const r = await lintWiki({
      wikiPath,
      db,
      client: stubClient([noopLlmResponse]),
      model: "stub/lint",
    });
    const orphans = r.issues.filter((i) => i.type === "orphan");
    const orphanSlugs = orphans.map((o) => o.affectedPages[0]).sort();
    expect(orphanSlugs).toEqual(["b", "c"]);
  });
});

describe("lintWiki — LLM pass", () => {
  it("merges deterministic findings with LLM-returned issues and uses LLM's overallHealth", async () => {
    await seed("a", "A", "Links to [[missing-page]].");
    const llmResp: LintResponse = {
      issues: [
        {
          severity: "high",
          type: "contradiction",
          description: "Page A and Page B disagree about X.",
          affectedPages: ["a"],
          suggestedFix: "Reconcile via a fresh source.",
        },
      ],
      suggestedQuestions: ["What's the source for X?"],
      overallHealth: "needs-work",
    };
    const r = await lintWiki({
      wikiPath,
      db,
      client: stubClient([llmResp]),
      model: "stub/lint",
    });
    expect(r.issues.some((i) => i.type === "broken-link" && i.source === "local")).toBe(true);
    expect(r.issues.some((i) => i.type === "contradiction" && i.source === "llm")).toBe(true);
    expect(r.suggestedQuestions).toEqual(["What's the source for X?"]);
    expect(r.overallHealth).toBe("needs-work");
  });
});

describe("removeBrokenLink", () => {
  it("strips [[bad]] and keeps the display text from [[bad|Display]]", async () => {
    await seed(
      "a",
      "A",
      "Refs: [[bogus]] in body and [[bogus|the bogus thing]] later. Also fine: [[other]].",
    );
    await seed("other", "Other", "Just here so [[a]]'s [[other]] link resolves.");
    const r = await removeBrokenLink(wikiPath, db, "a", "bogus");
    expect(r.page.content).not.toContain("[[bogus]]");
    expect(r.page.content).not.toContain("[[bogus|");
    expect(r.page.content).toContain("the bogus thing");
    expect(r.page.content).toContain("bogus in body"); // bare slug substitution
    // The good [[other]] link survives.
    expect(r.page.content).toContain("[[other]]");

    const onDisk = await readPage(wikiPath, "a");
    expect(onDisk.content).toBe(r.page.content);
  });

  it("throws when the page doesn't actually contain the broken link", async () => {
    await seed("a", "A", "no links at all");
    await expect(removeBrokenLink(wikiPath, db, "a", "bogus")).rejects.toThrow(/doesn't contain/);
  });
});
