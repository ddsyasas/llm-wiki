import { writeFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { NextResponse } from "next/server";

import {
  initWikiFolder,
  loadGlobalConfig,
  loadWikiSettings,
  removeRecentWiki,
  saveWikiSettings,
  setActiveWiki,
  getSchemaTemplate,
  SCHEMA_TEMPLATES,
  WIKI_PATHS,
  DEFAULT_WIKI_SETTINGS,
  type SchemaTemplateId,
} from "@llm-wiki/core";

export const dynamic = "force-dynamic";

type WikiDetail = {
  path: string;
  topic: string | null;
  exists: boolean;
};

async function enrichWiki(p: string): Promise<WikiDetail> {
  let exists = false;
  try {
    const s = await stat(p);
    exists = s.isDirectory();
  } catch {
    exists = false;
  }
  let topic: string | null = null;
  if (exists) {
    try {
      const settings = await loadWikiSettings(p);
      topic = settings.topic.trim() || null;
    } catch {
      topic = null;
    }
  }
  return { path: p, topic, exists };
}

// GET /api/wikis — currently-active wiki (enriched with topic + exists) plus
// the list of recents (also enriched). Active is returned as its own object
// because it isn't always present in `recents` — the first-run default wiki
// has never been "switched to," so it wouldn't be in the list otherwise.
export async function GET() {
  const cfg = await loadGlobalConfig();
  const activePath = cfg.activeWiki ?? defaultWikiPath();
  const [active, recents] = await Promise.all([
    enrichWiki(activePath),
    Promise.all(cfg.recentWikis.map(enrichWiki)),
  ]);
  return NextResponse.json({ active, recents });
}

type SwitchBody = { type: "switch"; path: string };
type CreateBody = {
  type: "create";
  path: string;
  topic: string;
  /** Optional schema template id — defaults to "blank" if omitted. */
  templateId?: SchemaTemplateId;
};
type RemoveBody = { type: "remove"; path: string };
type Body = SwitchBody | CreateBody | RemoveBody;

// POST /api/wikis — switch / create / remove. Discriminated by `type`.
// After any mutation the client should router.refresh(); resolveWikiPath()
// re-reads the global config on the next request and the whole app
// re-points to the new active wiki.
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  switch (body.type) {
    case "switch":
      return handleSwitch(body);
    case "create":
      return handleCreate(body);
    case "remove":
      return handleRemove(body);
    default:
      return NextResponse.json(
        { error: `unknown action: ${String((body as { type?: string }).type)}` },
        { status: 400 },
      );
  }
}

// ---- handlers -----------------------------------------------------------

async function handleSwitch(body: SwitchBody): Promise<Response> {
  const path = validatePath(body.path);
  if (!path) {
    return NextResponse.json(
      { error: "path is required and must be absolute" },
      { status: 400 },
    );
  }
  // Path must exist (we don't auto-create on a plain switch — only on create).
  try {
    const s = await stat(path);
    if (!s.isDirectory()) {
      return NextResponse.json(
        { error: `not a directory: ${path}` },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      {
        error: `path does not exist: ${path}. Use the Create action to make a new wiki here.`,
      },
      { status: 404 },
    );
  }

  // Idempotent — adds .llm-wiki / wiki / chats / raw / index.md / etc. if
  // they're not already there. Safe to call on a folder that's already a
  // wiki.
  await initWikiFolder(path);
  await setActiveWiki(path);

  return NextResponse.json({ ok: true, active: path });
}

async function handleCreate(body: CreateBody): Promise<Response> {
  const path = validatePath(body.path);
  if (!path) {
    return NextResponse.json(
      { error: "path is required and must be absolute" },
      { status: 400 },
    );
  }
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) {
    return NextResponse.json(
      { error: "topic is required for a new wiki" },
      { status: 400 },
    );
  }

  // initWikiFolder creates the directory tree + CLAUDE.md + index.md + log.md
  // + .gitignore. Idempotent so re-creating an existing wiki is fine.
  await initWikiFolder(path);

  // If the user picked a non-blank schema template, overwrite the freshly
  // created CLAUDE.md with the template body. Skip when templateId is
  // missing or "blank" — the default already wrote the blank version.
  if (body.templateId && body.templateId !== "blank") {
    const known = SCHEMA_TEMPLATES.find((t) => t.id === body.templateId);
    if (known) {
      const schemaPath = join(path, WIKI_PATHS.schema);
      const template = getSchemaTemplate(body.templateId);
      // Inject the topic into the template's "## Topic" section so the user
      // doesn't see a redundant placeholder right after picking one.
      const populated = template.body.replace(
        /## Topic\n\n\([^)]*\)/,
        `## Topic\n\n${topic}`,
      );
      await writeFile(schemaPath, populated, "utf8");
    }
  }

  // Stamp the topic into per-wiki settings so the LLM has scope from
  // operation one.
  const existing = await loadWikiSettings(path);
  await saveWikiSettings(path, {
    ...DEFAULT_WIKI_SETTINGS,
    ...existing,
    topic,
  });

  await setActiveWiki(path);

  return NextResponse.json({
    ok: true,
    active: path,
    topic,
    template: body.templateId ?? "blank",
  });
}

async function handleRemove(body: RemoveBody): Promise<Response> {
  const path = validatePath(body.path);
  if (!path) {
    return NextResponse.json(
      { error: "path is required and must be absolute" },
      { status: 400 },
    );
  }
  const next = await removeRecentWiki(path);
  return NextResponse.json({
    ok: true,
    active: next.activeWiki ?? defaultWikiPath(),
  });
}

// ---- helpers ------------------------------------------------------------

function validatePath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  // Resolve ~ shorthand the user might paste in. Anything else with a
  // leading ~ would have already been expanded by the shell if they ran
  // it as a command, but the picker form is a textbox so we handle it.
  const expanded = raw.startsWith("~")
    ? join(homedir(), raw.slice(1).replace(/^[\\/]+/, ""))
    : raw;
  const absolute = resolve(expanded);
  return absolute;
}

function defaultWikiPath(): string {
  return join(homedir(), "llm-wiki-default");
}
