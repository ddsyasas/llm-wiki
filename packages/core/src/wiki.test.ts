import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_INDEX_TEMPLATE,
  DEFAULT_LOG_TEMPLATE,
  DEFAULT_SCHEMA_TEMPLATE,
} from "./templates";
import type { Page } from "./types";
import {
  appendLog,
  initWikiFolder,
  listPages,
  readIndex,
  readPage,
  readSchema,
  WIKI_PATHS,
  writeIndex,
  writePage,
} from "./wiki";

let wikiPath: string;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-test-"));
});

afterEach(async () => {
  await rm(wikiPath, { recursive: true, force: true });
});

describe("initWikiFolder", () => {
  it("creates the full directory structure and stub files", async () => {
    await initWikiFolder(wikiPath);

    for (const sub of [WIKI_PATHS.wiki, WIKI_PATHS.raw, WIKI_PATHS.chats, WIKI_PATHS.tooling]) {
      const s = await stat(join(wikiPath, sub));
      expect(s.isDirectory()).toBe(true);
    }
    for (const folder of ["inbox", "pinned", "archive"]) {
      const s = await stat(join(wikiPath, WIKI_PATHS.chats, folder));
      expect(s.isDirectory()).toBe(true);
    }

    expect(await readFile(join(wikiPath, WIKI_PATHS.schema), "utf8")).toBe(DEFAULT_SCHEMA_TEMPLATE);
    expect(await readFile(join(wikiPath, WIKI_PATHS.index), "utf8")).toBe(DEFAULT_INDEX_TEMPLATE);
    expect(await readFile(join(wikiPath, WIKI_PATHS.log), "utf8")).toBe(DEFAULT_LOG_TEMPLATE);

    const gi = await readFile(join(wikiPath, WIKI_PATHS.gitignore), "utf8");
    expect(gi).toContain(".llm-wiki/");
  });

  it("is idempotent and does not overwrite existing user files", async () => {
    await initWikiFolder(wikiPath);
    await writeFile(join(wikiPath, WIKI_PATHS.schema), "# my custom schema\n", "utf8");
    await initWikiFolder(wikiPath);

    const schema = await readFile(join(wikiPath, WIKI_PATHS.schema), "utf8");
    expect(schema).toBe("# my custom schema\n");
  });
});

describe("writePage + readPage", () => {
  it("round-trips a page including all frontmatter fields", async () => {
    await initWikiFolder(wikiPath);

    const page: Page = {
      slug: "shors-algorithm",
      frontmatter: {
        title: "Shor's Algorithm",
        slug: "shors-algorithm",
        type: "concept",
        created: "2026-04-15",
        updated: "2026-05-23",
        sources: ["shor-1994-paper", "my-notes"],
        tags: ["quantum", "algorithm", "cryptography"],
      },
      content:
        "A quantum algorithm for [[integer-factorization]] that runs in polynomial time.\n" +
        "Discovered by [[peter-shor]] in 1994.\n",
    };
    await writePage(wikiPath, page);
    const round = await readPage(wikiPath, "shors-algorithm");

    expect(round.slug).toBe(page.slug);
    expect(round.frontmatter.title).toBe(page.frontmatter.title);
    expect(round.frontmatter.type).toBe(page.frontmatter.type);
    expect(round.frontmatter.created).toBe(page.frontmatter.created);
    expect(round.frontmatter.updated).toBe(page.frontmatter.updated);
    expect(round.frontmatter.sources).toEqual(page.frontmatter.sources);
    expect(round.frontmatter.tags).toEqual(page.frontmatter.tags);
    expect(round.content).toBe(page.content);
  });

  it("rejects a page with an invalid type", async () => {
    await initWikiFolder(wikiPath);
    const bogus =
      "---\n" +
      "title: Bad\n" +
      "slug: bad\n" +
      "type: nonsense\n" +
      "created: 2026-01-01\n" +
      "updated: 2026-01-01\n" +
      "---\n\nbody\n";
    await writeFile(join(wikiPath, WIKI_PATHS.wiki, "bad.md"), bogus, "utf8");
    await expect(readPage(wikiPath, "bad")).rejects.toThrow(/type/);
  });

  it("rejects a page missing required frontmatter", async () => {
    await initWikiFolder(wikiPath);
    const noTitle =
      "---\n" +
      "slug: no-title\n" +
      "type: concept\n" +
      "created: 2026-01-01\n" +
      "updated: 2026-01-01\n" +
      "---\n\nbody\n";
    await writeFile(join(wikiPath, WIKI_PATHS.wiki, "no-title.md"), noTitle, "utf8");
    await expect(readPage(wikiPath, "no-title")).rejects.toThrow(/title/);
  });
});

describe("listPages", () => {
  it("returns an empty array when no pages exist", async () => {
    await initWikiFolder(wikiPath);
    expect(await listPages(wikiPath)).toEqual([]);
  });

  it("returns an empty array when wiki/ is missing entirely", async () => {
    expect(await listPages(wikiPath)).toEqual([]);
  });

  it("returns summaries sorted by slug", async () => {
    await initWikiFolder(wikiPath);
    const pages: Page[] = [
      {
        slug: "zeta",
        frontmatter: {
          title: "Zeta",
          slug: "zeta",
          type: "concept",
          created: "2026-01-01",
          updated: "2026-01-01",
        },
        content: "z",
      },
      {
        slug: "alpha",
        frontmatter: {
          title: "Alpha",
          slug: "alpha",
          type: "entity",
          created: "2026-01-01",
          updated: "2026-01-02",
        },
        content: "a",
      },
    ];
    for (const p of pages) await writePage(wikiPath, p);

    const list = await listPages(wikiPath);
    expect(list.map((p) => p.slug)).toEqual(["alpha", "zeta"]);
    expect(list[0]).toMatchObject({ slug: "alpha", title: "Alpha", type: "entity" });
  });

  it("skips malformed pages without throwing", async () => {
    await initWikiFolder(wikiPath);
    await writePage(wikiPath, {
      slug: "good",
      frontmatter: {
        title: "Good",
        slug: "good",
        type: "concept",
        created: "2026-01-01",
        updated: "2026-01-01",
      },
      content: "fine",
    });
    await writeFile(
      join(wikiPath, WIKI_PATHS.wiki, "broken.md"),
      "no frontmatter at all\n",
      "utf8",
    );

    const list = await listPages(wikiPath);
    expect(list.map((p) => p.slug)).toEqual(["good"]);
  });
});

describe("index", () => {
  it("read returns the default template after init", async () => {
    await initWikiFolder(wikiPath);
    expect(await readIndex(wikiPath)).toBe(DEFAULT_INDEX_TEMPLATE);
  });

  it("write replaces the file contents", async () => {
    await initWikiFolder(wikiPath);
    await writeIndex(wikiPath, "# new\n- a\n- b\n");
    expect(await readIndex(wikiPath)).toBe("# new\n- a\n- b\n");
  });
});

describe("appendLog", () => {
  it("appends entries below the header without overwriting prior content", async () => {
    await initWikiFolder(wikiPath);
    await appendLog(wikiPath, "## [2026-05-23 14:30] ingest | first source");
    await appendLog(wikiPath, "## [2026-05-23 14:45] query | how does X work?");

    const log = await readFile(join(wikiPath, WIKI_PATHS.log), "utf8");
    expect(log.startsWith(DEFAULT_LOG_TEMPLATE)).toBe(true);
    expect(log).toContain("## [2026-05-23 14:30] ingest | first source");
    expect(log).toContain("## [2026-05-23 14:45] query | how does X work?");

    const matches = log.match(/^## \[/gm) ?? [];
    expect(matches).toHaveLength(2);
  });
});

describe("readSchema", () => {
  it("returns the default schema template after init", async () => {
    await initWikiFolder(wikiPath);
    expect(await readSchema(wikiPath)).toBe(DEFAULT_SCHEMA_TEMPLATE);
  });
});
