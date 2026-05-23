# Dev Log — LLM Wiki

**Maintained for context-window resilience.** This file is the single source of truth for where the project is, what's been built, what's broken, and what's next. Read this first when picking up after a long break or in a fresh chat session.

Last updated: 2026-05-24

---

## What this project is

Open-source local-first knowledge base implementing Andrej Karpathy's LLM Wiki pattern (gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

- **One folder, three layers**: raw sources → LLM-maintained wiki → user's CLAUDE.md schema.
- **Three operations**: ingest, query, lint.
- **Everything is a file**: pages, chats, schema, log all `.md` in a folder the user owns.
- **Local-first, BYOK**: no telemetry, no remote storage, OpenRouter API key in OS keychain.

Repo: **https://github.com/ddsyasas/llm-wiki** (public, MIT).

---

## Status snapshot — 2026-05-24

**26 commits on `main`.** Build plan (docs/10) steps 0–14 complete. Two design passes + multiple UX fixes shipped.

```
b442594 Fix: prompts now embed explicit JSON shape; friendlier ingest error UI
06d877c Fix: API key view-mode, theme hydration error, one-wiki-one-topic copy
e6cc5b2 Fix sidebars actually filling viewport height
cf8fd0a Design-pass fixes: kbd glyphs, sidebar height, header theme toggle
b937b5d Design pass: real fonts, paper palette, unified shell, real home page
594f6b9 Step 14: polish — footer, Cmd+K palette, cost previews, trash retention
db65d68 Step 13: CLI (start / init / config / doctor / version)
14ba8d0 Step 12: schema editor + tabbed settings + cost tracking + theme
b51dc7e Step 11: lint (health check) + remove-broken-link quick-fix
d51b92e Step 10: chat threads (multi-turn, folders, promote-to-wiki)
f29667b Step  9: query mode + save-as-wiki-page
e73b9fa Step  8: all V1 source formats (URL, DOCX, PPTX, XLSX, PDF, image)
d69e5de Step  7: wiki browse + edit UI
5124cbd Step  6: ingest pipeline (text/markdown end-to-end)
b37226a Step  5: config + API key management
106dd51 Step  4: OpenRouter client
b383790 Step  3: file-system to DB sync
dbe3ae1 Step  2: SQLite metadata layer
a671f20 Step  1: wiki folder I/O
67a0ab5 Step  0: monorepo scaffold
```

**Test suite**: 114 core + 14 llm + 11 ingestion = 139 passing, 1 smoke skipped (no API key in env).

---

## Architecture

### Repo layout (pnpm monorepo)
```
llm-wiki/
├── apps/web/                      Next.js 14 App Router app + CLI
│   ├── bin/llm-wiki.mjs           Plain-JS CLI entry (no compile step)
│   ├── scripts/copy-standalone-assets.mjs
│   ├── next.config.mjs            output: standalone, externals, transpile
│   └── src/
│       ├── app/                   route handlers + page.tsx files
│       │   ├── (root layout, page.tsx home)
│       │   ├── wiki/              has nested layout (sidebar)
│       │   ├── chats/             has nested layout (sidebar)
│       │   ├── sources/ query/ lint/ schema/ settings/  (no sidebar)
│       │   └── api/               REST endpoints
│       ├── components/
│       │   ├── app-shell.tsx      passthrough: header + main + footer
│       │   ├── app-header.tsx     wordmark + nav + Cmd+K hint + theme toggle
│       │   ├── footer.tsx
│       │   ├── theme-provider.tsx + theme-toggle.tsx
│       │   ├── command-palette.tsx ⌘K modal
│       │   ├── cost-preview.tsx
│       │   ├── page-shell.tsx     PageContainer / PageHeader / Card primitives
│       │   ├── wiki/              sidebar, markdown-view, page-editor, page-view
│       │   ├── chats/             sidebar, chat-view, promote-message
│       │   ├── settings/          general / models / api / costs / about tabs
│       │   └── ui/                shadcn (Button, Input, Textarea)
│       └── lib/                   server-config, server-wiki, cost-estimate,
│                                  use-wiki-settings, utils
└── packages/
    ├── core/                      ingest/query/lint primitives + file I/O
    │   └── src/
    │       ├── ingest.ts query.ts lint.ts chat.ts editor.ts
    │       ├── wiki.ts            initWikiFolder, readPage, writePage, etc.
    │       ├── db.ts db-pages.ts db-sources.ts db-chats.ts db-usage.ts
    │       │   db-sync.ts         better-sqlite3 + 7 tables (FTS5 included)
    │       ├── sync.ts            chokidar live watch + syncWikiToDb
    │       ├── config.ts secrets.ts  global + per-wiki config; keytar w/
    │       │                       file fallback
    │       ├── links.ts           extractWikiLinks, findBacklinks
    │       ├── schema.ts          zod IngestResponse / Query / Lint
    │       ├── prompts/           ingest / query / chat / lint builders
    │       ├── templates.ts       default CLAUDE.md / index.md / log.md
    │       └── types.ts           PageType, PageRow, ChatRow, etc.
    ├── ingestion/                 source format parsers
    │   └── src/
    │       ├── detect.ts          extension + magic-byte sniff
    │       ├── plain.ts markdown.ts
    │       ├── html.ts            Readability + jsdom + turndown
    │       ├── url.ts             fetch + extractHtml
    │       ├── docx.ts            mammoth + turndown
    │       ├── pptx.ts xlsx.ts    officeparser
    │       ├── pdf.ts image.ts    vision pass-through (base64)
    │       └── types.ts
    └── llm/                       OpenRouter client wrapper
        └── src/
            ├── client.ts          createClient, callLLM, chatComplete
            ├── models.ts          DEFAULT_MODELS, SUGGESTED_MODELS, PRICING
            └── errors.ts          typed error hierarchy
```

### Data model

User's wiki folder (default `~/llm-wiki-default`):
```
<wiki>/
├── CLAUDE.md          schema (editable; the LLM's contract)
├── index.md           auto-maintained catalog
├── log.md             append-only event log
├── .gitignore         auto-generated, ignores .llm-wiki/
├── raw/               original source files (immutable)
├── wiki/              LLM-maintained .md pages with YAML frontmatter
├── chats/{inbox,pinned,archive}/  thread .md files
└── .llm-wiki/
    ├── meta.sqlite    pages/sources/chats/usage + FTS5 index
    ├── settings.json  per-wiki config
    ├── page-history/  edit backups
    ├── schema-history/ schema edit backups (last 10)
    └── trash/chats/   deleted chats, 30-day TTL
```

Global config: `~/.llm-wiki/config.json` (recentWikis, uiTheme; openrouterKey only when keychain unavailable).

OS keychain entry: service `llm-wiki`, account `openrouter`.

---

## Key design decisions

1. **No standalone publishable tarball yet.** Step 13 produced a CLI that works in dev. Step 15 (publish to npm) is deferred — packaging workspace deps + the standalone server 500 issue both need attention.

2. **Plain JS CLI.** `apps/web/bin/llm-wiki.mjs` is pure ESM that inlines initWikiFolder + config helpers rather than importing from `@llm-wiki/core` (which uses TS-source extensionless imports that plain Node ESM can't resolve). Trade-off: small code duplication; benefit: no compile step.

3. **Sidebar layout uses body h-screen + main overflow-y-auto.** Previous attempts with `min-h-screen` and `h-[calc(...)]` had the sidebar collapsing to its content height. Locking body to viewport and using flex stretch defaults fixes this cleanly. See `apps/web/src/app/layout.tsx` and `app-shell.tsx`.

4. **JSON schema example embedded in prompts.** Haiku-grade models drift on JSON adherence when the schema is only described in prose. Each prompt builder now ends with an explicit `JSON_SHAPE` block showing the literal expected object. See `packages/core/src/prompts/{ingest,query,lint}.ts`.

5. **One wiki = one topic, by design.** Per Karpathy. The `topic` field in Settings → General describes the wiki's scope; multi-topic = multiple wiki folders + `LLM_WIKI_PATH` switching.

6. **Native deps (keytar, better-sqlite3, mammoth, jsdom, etc.) externalized in webpack.** `next.config.mjs` puts them in `experimental.serverComponentsExternalPackages` AND `webpack.externals` so Next's transpilePackages walker doesn't try to bundle `.node` binaries or massive DOM emulations.

7. **Theme via simple localStorage + script-tag preflight.** No `next-themes` dep. Inline `THEME_INIT_SCRIPT` in `<head>` applies the `dark` class before hydration; `ThemeProvider` keeps state in React. Both `ThemeToggle` (header) and the General tab buttons use `mounted` flag to avoid SVG hydration mismatch.

8. **FTS5 query sanitization.** `searchPages` splits the query on whitespace and quotes each token as a phrase. Hyphens like `[[other-page]]` would otherwise be interpreted as FTS5 column exclusion operators and throw `no such column: page`.

---

## Recent fixes (post Step 14)

**Design pass (`b937b5d`)** — real fonts (Fraunces / Crimson Pro / Inter / JetBrains Mono via `next/font/google`), paper palette per docs/08, unified AppShell, real home page with stat tiles + action cards, PageContainer/PageHeader primitives.

**Sidebar height fix (`e6cc5b2`)** — body locked to `h-screen`, main is the single scroll region, sidebars stretch via flex default. Sidebar bg/border bumped from `/50` and `/70` opacities to solid for dark-mode visibility.

**Kbd / theme hydration / sidebar (`cf8fd0a`)** — kbd hints switched to Inter sans (mono mis-baselines ⌘ glyph at small sizes). Layouts decoupled from double `min-h-screen` chain. Theme toggle added to header.

**API key view-mode (`06d877c`)** — Settings → API tab now defaults to a "view" mode showing the masked key (`sk-or-v1-••••••••••••••••teme`) read-only with Test/Replace/Remove buttons. Clicking Replace switches to edit mode with input + Save/Cancel. Also fixed hydration error on ThemeToggle + GeneralTab theme buttons (mounted-flag pattern). Topic field gained help box explaining one-wiki-one-topic + how to switch folders.

**Prompt JSON shape (`b442594`)** — Haiku was stuffing the user's wiki topic into `indexEntries[].category` instead of using the enum. All three prompts (ingest, query, lint) now embed an explicit JSON shape example with strict field rules. Sources page error UI wraps schema-validation errors in a friendly banner with retry advice + collapsible technical detail.

---

## Open issues / TODOs

### Active issue (this session)
- **Default model slugs are outdated.** `anthropic/claude-3-5-sonnet` and `anthropic/claude-3-5-haiku` were retired. OpenRouter returns "model not available." Need to update to current Claude 4.x family slugs (`anthropic/claude-sonnet-4.6`, `anthropic/claude-haiku-4.5`, etc.).
- **Model selection should be a dropdown, not free-text.** Currently `apps/web/src/components/settings/models-tab.tsx` uses `<Input>` with a `<datalist>`. User wants a proper `<select>` with curated options + an "Other (custom)" option.
- **Pricing table needs updating** to match new model slugs.

### Deferred from Step 13/14
- **Standalone server 500 on requests** — standalone bundle boots ("Ready in 58ms") but every request errors. Likely native deps + pnpm symlink issue. Dev-mode CLI start works fine. Real fix is Step 15 territory.
- **`pnpm pack` produces tarball but `npm install ./tarball` fails** because `@llm-wiki/*` deps are still `workspace:*`. `pnpm publish` rewrites these but we haven't actually published.

### Step 15 (only build step remaining)
- `docs/INSTALL.md`, `docs/OPENROUTER_SETUP.md`, `docs/MODELS.md`, `docs/TROUBLESHOOTING.md`
- README screenshots
- npm publish workflow (resolves the two items above)
- Versioning + changelog

### Known minor issues
- Chokidar live-watch test in `sync.test.ts` occasionally flakes (poll window timing-sensitive). Re-run usually passes. Not blocking; flake is ~1 in 5 runs.

---

## How to run

```bash
cd "/Users/ddsyasas/ProjectFiles/Dev Projects/Business dev/llm-wiki"

# Pick a wiki folder
export LLM_WIKI_PATH=~/llm-wiki-default

# Dev server
pnpm dev

# Or via the CLI
node apps/web/bin/llm-wiki.mjs start ~/llm-wiki-default

# Tests
pnpm --filter @llm-wiki/core test          # 114 tests
pnpm --filter @llm-wiki/llm test           # 14 + 1 skipped (smoke)
pnpm --filter @llm-wiki/ingestion test     # 11 tests
pnpm -r typecheck                          # all 4 packages

# Smoke test the real OpenRouter call (requires key)
OPENROUTER_API_KEY=sk-or-v1-... pnpm --filter @llm-wiki/llm test
```

### Killing leftover dev servers
```bash
pkill -f "next-server"          # nuclear option, only matches Next.js servers
lsof -nP -iTCP:3000 -sTCP:LISTEN -t | xargs kill  # specific port
```

---

## Test corpus for verification

Four quantum-computing source texts live in chat history (Shor's algorithm, Grover's algorithm, Quantum Error Correction, Quantum Supremacy with a deliberate Grover-1994-vs-1996 contradiction). Use these to exercise ingest, query, chat, lint end-to-end. The contradiction should ideally surface in lint or in the ingest contradictions array.

---

## Common tasks

### Add a new API route
1. Create `apps/web/src/app/api/<name>/route.ts` exporting `GET`/`POST`/etc.
2. Use `openWikiContext()` from `@/lib/server-wiki` to get a DB connection + settings.
3. **Always close the db in a `finally` block.**
4. Mark `export const dynamic = "force-dynamic"` to skip caching.

### Add a new core function that needs the DB
- Pure CRUD → `packages/core/src/db-*.ts`.
- Higher-level orchestration → its own module (`chat.ts`, `ingest.ts`, `editor.ts`).
- Always re-export from `packages/core/src/index.ts`.

### Add a new shadcn component
shadcn-ui CLI is now `npx shadcn@latest add <component>`. Or paste the component source manually (we did this for Button, Input, Textarea — keeps deps low).

---

## Where things live

| Need to | Look in |
|---------|---------|
| Add or change a wiki I/O primitive | `packages/core/src/wiki.ts` |
| Change an LLM prompt | `packages/core/src/prompts/*.ts` |
| Tweak the zod schema for an operation | `packages/core/src/schema.ts` |
| Add a new source format | `packages/ingestion/src/<format>.ts` + register in `apps/web/src/app/api/ingest/route.ts` `runExtractor` |
| Add a new top-level nav item | `apps/web/src/components/app-header.tsx` PRIMARY_NAV or UTIL_NAV |
| Add or change a model preset | `packages/llm/src/models.ts` DEFAULT_MODELS / SUGGESTED_MODELS / PRICING |
| Change CSS palette | `apps/web/src/app/globals.css` `:root` and `.dark` |
| Add a typography variant | `apps/web/tailwind.config.ts` `fontSize` extension |
| Fix something in the CLI | `apps/web/bin/llm-wiki.mjs` (plain JS, no compile) |

---

## Open questions for future sessions

1. Should we ship `next-themes` instead of the homegrown ThemeProvider? Tradeoff: ~5KB dep vs. zero deps + a few extra lines.
2. Should models.ts pull pricing from OpenRouter's `/models` endpoint at runtime instead of hardcoding? More correct but adds latency + a cache layer.
3. Should the CLI use `tsx` to import from `@llm-wiki/core` instead of inlining init logic? Eliminates duplication but adds a runtime dep.
4. Is there value in a "watch mode" for sources? (User drops files into `raw/` from their file manager, app auto-ingests.) Mentioned in docs but deferred.

---

## When in doubt

Read `CLAUDE.md` at the repo root + `docs/01-vision.md` through `docs/11-attribution-license.md`. They're the design contract; this dev log captures execution + drift from it.
