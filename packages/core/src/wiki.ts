import { mkdir, readFile, writeFile, appendFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";

import matter from "gray-matter";

import {
  DEFAULT_GITIGNORE_TEMPLATE,
  DEFAULT_INDEX_TEMPLATE,
  DEFAULT_LOG_TEMPLATE,
  DEFAULT_SCHEMA_TEMPLATE,
} from "./templates";
import { PAGE_TYPES, type Page, type PageFrontmatter, type PageSummary, type PageType } from "./types";

export const WIKI_PATHS = {
  schema: "CLAUDE.md",
  index: "index.md",
  log: "log.md",
  gitignore: ".gitignore",
  wiki: "wiki",
  raw: "raw",
  chats: "chats",
  tooling: ".llm-wiki",
} as const;

const DEFAULT_CHAT_FOLDERS = ["inbox", "pinned", "archive"] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  if (await exists(path)) return;
  await writeFile(path, content, "utf8");
}

export async function initWikiFolder(wikiPath: string): Promise<void> {
  await mkdir(wikiPath, { recursive: true });

  const dirs = [
    join(wikiPath, WIKI_PATHS.wiki),
    join(wikiPath, WIKI_PATHS.raw),
    join(wikiPath, WIKI_PATHS.chats),
    join(wikiPath, WIKI_PATHS.tooling),
    ...DEFAULT_CHAT_FOLDERS.map((f) => join(wikiPath, WIKI_PATHS.chats, f)),
  ];
  await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));

  await writeIfMissing(join(wikiPath, WIKI_PATHS.schema), DEFAULT_SCHEMA_TEMPLATE);
  await writeIfMissing(join(wikiPath, WIKI_PATHS.index), DEFAULT_INDEX_TEMPLATE);
  await writeIfMissing(join(wikiPath, WIKI_PATHS.log), DEFAULT_LOG_TEMPLATE);
  await writeIfMissing(join(wikiPath, WIKI_PATHS.gitignore), DEFAULT_GITIGNORE_TEMPLATE);
}

function pageFilePath(wikiPath: string, slug: string): string {
  return join(wikiPath, WIKI_PATHS.wiki, `${slug}.md`);
}

function parseFrontmatter(slug: string, data: Record<string, unknown>): PageFrontmatter {
  const title = data["title"];
  const type = data["type"];
  const created = data["created"];
  const updated = data["updated"];

  if (typeof title !== "string" || title.length === 0) {
    throw new Error(`page ${slug}: frontmatter missing required field 'title'`);
  }
  if (typeof type !== "string" || !PAGE_TYPES.includes(type as PageType)) {
    throw new Error(
      `page ${slug}: frontmatter 'type' must be one of ${PAGE_TYPES.join(", ")}, got ${String(type)}`,
    );
  }
  const createdStr = normalizeDateField(created);
  const updatedStr = normalizeDateField(updated);
  if (createdStr === undefined) {
    throw new Error(`page ${slug}: frontmatter missing required field 'created'`);
  }
  if (updatedStr === undefined) {
    throw new Error(`page ${slug}: frontmatter missing required field 'updated'`);
  }

  const sources = readStringArray(data["sources"], `${slug}.sources`);
  const tags = readStringArray(data["tags"], `${slug}.tags`);

  const fm: PageFrontmatter = {
    title,
    slug,
    type: type as PageType,
    created: createdStr,
    updated: updatedStr,
  };
  if (sources) fm.sources = sources;
  if (tags) fm.tags = tags;
  return fm;
}

// gray-matter parses unquoted YAML dates as Date objects. We store dates as
// strings on disk (per docs/03), so coerce in either direction.
function normalizeDateField(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v;
  return undefined;
}

function readStringArray(v: unknown, field: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    throw new Error(`frontmatter '${field}' must be an array of strings`);
  }
  return v.map((item, i) => {
    if (typeof item !== "string") {
      throw new Error(`frontmatter '${field}[${i}]' must be a string`);
    }
    return item;
  });
}

export async function readPage(wikiPath: string, slug: string): Promise<Page> {
  const raw = await readFile(pageFilePath(wikiPath, slug), "utf8");
  const parsed = matter(raw);
  const frontmatter = parseFrontmatter(slug, parsed.data as Record<string, unknown>);
  // gray-matter keeps a leading newline after the closing ---; trim it so
  // round-tripping is stable.
  const content = parsed.content.replace(/^\n/, "");
  return { slug, frontmatter, content };
}

export async function writePage(wikiPath: string, page: Page): Promise<void> {
  await mkdir(join(wikiPath, WIKI_PATHS.wiki), { recursive: true });
  const fm: PageFrontmatter = { ...page.frontmatter, slug: page.slug };
  const serialized = matter.stringify(page.content, fm as unknown as Record<string, unknown>);
  await writeFile(pageFilePath(wikiPath, page.slug), serialized, "utf8");
}

export async function listPages(wikiPath: string): Promise<PageSummary[]> {
  const dir = join(wikiPath, WIKI_PATHS.wiki);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const slugs = entries.filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
  const pages = await Promise.all(
    slugs.map(async (slug): Promise<PageSummary | null> => {
      try {
        const page = await readPage(wikiPath, slug);
        return {
          slug: page.slug,
          title: page.frontmatter.title,
          type: page.frontmatter.type,
          updated: page.frontmatter.updated,
        };
      } catch {
        // Skip malformed pages — listPages should never throw. Callers that
        // need strict validation should call readPage directly.
        return null;
      }
    }),
  );
  return pages.filter((p): p is PageSummary => p !== null).sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readIndex(wikiPath: string): Promise<string> {
  return readFile(join(wikiPath, WIKI_PATHS.index), "utf8");
}

export async function writeIndex(wikiPath: string, content: string): Promise<void> {
  await writeFile(join(wikiPath, WIKI_PATHS.index), content, "utf8");
}

export async function appendLog(wikiPath: string, entry: string): Promise<void> {
  const trimmed = entry.endsWith("\n") ? entry : `${entry}\n`;
  // Separate entries from the prior content with a blank line so grep "^## \["
  // matches each entry cleanly per docs/03.
  await appendFile(join(wikiPath, WIKI_PATHS.log), `\n${trimmed}`, "utf8");
}

export async function readSchema(wikiPath: string): Promise<string> {
  return readFile(join(wikiPath, WIKI_PATHS.schema), "utf8");
}
