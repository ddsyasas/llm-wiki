# Dev Log — LLM Wiki

**Maintained for context-window resilience.** This file is the single source of truth for where the project is, what's been built, what's broken, and what's next. Read this first when picking up after a long break or in a fresh chat session.

Last updated: 2026-05-24 (v1.0 released)

---

## What this project is

Open-source local-first knowledge base implementing Andrej Karpathy's LLM Wiki pattern (gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

- **One folder, three layers**: raw sources → LLM-maintained wiki → user's CLAUDE.md schema.
- **Three operations**: ingest, query, lint.
- **Everything is a file**: pages, chats, schema, log all `.md` in a folder the user owns.
- **Local-first, BYOK**: no telemetry, no remote storage, OpenRouter API key in OS keychain.

Repo: **https://github.com/ddsyasas/llm-wiki** (public, MIT).

---

## Status snapshot — 2026-05-24 (v1.0)

**44+ commits on `main`, tagged `v1.0.0`.** Build plan (docs/10) steps 0–14 complete plus full P0 + P1 #10 (graph view). Two design passes, multiple UX fixes, model-slug update, Karpathy-pattern audit, lint quick-fixes wave, perceived-perf pass, doc-pages set (About / Help / Developers), 3D graph view, and v1.0 release shipped.

```
HEAD    Doc pages: About, Help, Developers + footer links + dev-log update
4a987ca Surface source lineage: Sources section on wiki pages + /sources/[id] detail
9a010f7 Teach tailwind-merge about our custom text-* font sizes
39d5861 Loading skeletons + click-state on clickable cards
5ce3780 Redesign /wiki landing — card grid grouped by type
f5e2b4e Add /log page — in-browser view of log.md
0927a61 Show the actual log.md path on the Lint page
48f64d1 Lint history: always-visible Recent runs panel on /lint
e34575a Lint history: append summary to log.md, show previous-run delta
f206195 Add docs/dev-setup.md — run, stop, recover from stuck ports
67530dc Widen split-pane editors + fill viewport height
b3a9261 Refresh index entry on every page edit + create
46f07a3 Fix Apply-suggested-fix routing + surface no-op when LLM punts
5e59b69 Lint quick-fixes: rebuild index, fix all broken links, create stub, apply suggested fix
c776f7c Defensive JSON parse: strip markdown fences + prose before JSON.parse
61306b0 Add dedicated chat model slot; fix hardcoded retired-slug fallback
5f43e51 Update model slugs to Claude 4.x; replace text-input with select dropdown
187ecb6 Karpathy-pattern audit: first-run gate, sources list, chat-as-source ingest
914316f Add docs/dev-log.md — project state for context-window resilience
… (steps 0–14 + design passes — see git log for the full history)
```

**Test suite**: ~125+ core + 17 llm + 11 ingestion = 153+ passing, 1 smoke skipped (no API key), 1 chokidar flake (not blocking).

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

## Karpathy-pattern audit — 2026-05-24

User asked to verify the app actually implements Karpathy's pattern as someone-without-heavy-tech-knowledge would experience it in the browser. Re-grounded against `docs/01-vision`, `docs/04-features-v1`, `docs/06-ingest-pipeline`, `docs/07-chat-threads`, `docs/08-ui-design`.

**Verified working** ✅
- **Three layers** are all reachable from the top nav: Sources (raw), Wiki (LLM-maintained pages with index + per-page view + backlinks + inline edit), Schema (split-pane `CLAUDE.md` editor with auto-backup to `.llm-wiki/schema-history/`, last 10 kept).
- **Three operations** each have a dedicated route with cost preview where applicable: Ingest (`/sources`), Query (`/query`), Lint (`/lint` with severity grouping, broken-link auto-fix, clickable follow-up questions).
- **Per-message "Save as wiki page"** on every chat assistant turn and on query results when a `suggestedNewPage` is returned.
- **Five model slots** (ingest / query / chat / lint / vision), per-slot dropdowns + custom-slug escape hatch in Settings → Models.

**Gaps found and closed**
1. **No first-run gate** — user without API key or topic landed on a dashboard with stat tiles, hit "Add a source", failed at first ingest. Docs/04 P0 #1 explicitly required a setup wizard. → Built `components/onboarding.tsx`. `apps/web/src/app/page.tsx` server-side checks `getApiKey()` and `settings.topic`; if either is missing, renders the wizard instead of the dashboard. Single-card design (topic + key fields + Test button + OpenRouter signup link) — docs/08's three-step modal was overkill for two fields.
2. **No sources list** on `/sources` — only the ingest form existed, so after ingesting you had no way to see your sources or trace which pages came from which. Docs/08 §"Sources view" required a list with format / size / dates / page count. → Added `GET /api/sources` (joins `page_sources` for a count) + `components/sources/sources-list.tsx`. The list sits above the ingest form and re-fetches automatically after a successful ingest via a nonce bump.
3. **No "Ingest whole chat as a source"** — only per-message promote existed. Docs/06 §"Special case" and docs/07 §"Ingest the whole chat" explicitly call this out as the pattern for promoting a useful thread into the permanent wiki layer. → Added a header button on `chat-view.tsx` that stringifies the messages with role markers and POSTs to `/api/ingest` with `title: "Chat: …"`. Result banner shows links to created and updated pages.
4. **Lint not surfaced on home** — three operations but only two were action cards (Add source, Ask question). → Home action grid is now four cards (Sources / Query / Wiki / Lint), wraps to 2×2 on tablet and 1×4 on desktop. Lint card is disabled-effectively (CTA "Add a source first") when `pageCount === 0`.

**What I deliberately did NOT add**
- Per-source "Re-ingest" / "Delete" buttons. Docs/08 mention them in the source detail view, but the data round-trip + edge cases (unlinking the page_sources rows when a source is deleted; running ingest a second time updates rather than replaces) is bigger than a single-session change. Tracking as a follow-up.
- Per-source "What pages did this produce" drill-down. The list shows a `N pages` count today; the click-through view is a follow-up.
- Sources detail view (extracted markdown shown alongside the source). Same reason — follow-up.
- Server-side gating of `/wiki`, `/query`, `/lint` for missing key. Direct-bookmark hits to those routes still fail loud at the API layer (`OpenRouter API key not configured`). The home gate covers the common path; full middleware redirect is a follow-up if direct-bookmark UX matters.

**Files touched this audit**
- `apps/web/src/app/page.tsx` — added first-run check, expanded action grid to 4
- `apps/web/src/components/onboarding.tsx` — new
- `apps/web/src/app/api/sources/route.ts` — new
- `apps/web/src/components/sources/sources-list.tsx` — new
- `apps/web/src/app/sources/page.tsx` — added list section + refresh nonce
- `apps/web/src/components/chats/chat-view.tsx` — added Ingest → wiki button + result banner

---

## Sprint — 2026-05-24 (late): lint quick-fixes + perceived-perf pass + doc pages

After the Karpathy-pattern audit shipped, the next session covered four arcs in one stretch. Capturing here so future-me / future-devs can see the *why* behind each commit, not just the diff.

### A. Defensive LLM JSON parsing — `c776f7c`

User hit "Run lint" → got `LLM response was not valid JSON: Unexpected token '`'`. Root cause: Anthropic models don't natively support `response_format: json_object`. OpenRouter forwards the request but the model still wraps output in ` ```json … ``` ` markdown fences. Our parser called `JSON.parse(raw)` and choked on the leading backtick.

Fix: new `extractJsonBody()` in `packages/llm/src/client.ts` that (1) strips a surrounding ` ``` ` fence with optional language tag, (2) slices to the first `{` through the last `}` so any preamble like "Here's the JSON you asked for:" gets ignored. Three new client.test.ts cases lock the regex (fence with tag / bare fence / prose prepend). Applies to every LLM operation — ingest, query, chat, lint.

### B. Lint quick-fixes wave — `5e59b69`, `46f07a3`, `b3a9261`

The lint page reported 19 issues but only had a per-issue "Remove broken link" button. Reporting alone is homework. User: *"can we add an option for users to fix those automatically or something because reporting is not enough."*

Built four fix capabilities, all dispatched via `POST /api/lint/fix` with a `type` discriminator:

- **`rebuild-index`** (local, free) — new `rebuildIndexFromPages(wikiPath, db)` in `packages/core/src/index-builder.ts`. Lifted `parseIndexEntries` / `renderIndex` / `CATEGORY_HEADINGS` out of ingest.ts into this shared module so the rebuild can reuse what the LLM ingest already uses. Preserves hand-tuned summaries; auto-generates one-line summaries for newly-added entries; removes orphan entries whose pages were deleted manually.
- **`fix-all-broken-links`** (local, free) — bulk iteration over the existing `removeBrokenLink`. Confirms before mass-rewriting.
- **`create-stub-page`** (LLM, ~$0.01) — new `createStubPage()` in `packages/core/src/lint-fixes.ts`. Gathers backlinks for the missing slug, feeds them as context, asks the LLM for `{title, type, content, tags}` with a strict zod schema. Falls back to `rebuild-index` when the slug already has a page (i.e. "missing from index" issues).
- **`apply-suggested-fix`** (LLM, ~$0.01) — new `applyLintSuggestedFix()` in `lint-fixes.ts`. Reads the affected page, sends to LLM with the suggested-fix instruction, writes the rewritten body via `applyManualEdit` (backed up to `.llm-wiki/page-history/`).

**Routing bug fixed mid-stream** (`46f07a3`): contradictions list multiple `affectedPages` (e.g. `["grovers-algorithm", "lov-grover"]`) but the client was always sending `affectedPages[0]` to the LLM. The Grover contradiction's suggested fix said "update lov-grover" → we kept sending grovers-algorithm (already correct) → LLM returned no-op → 2 useless rewrites of the correct page, the wrong page never touched. Backups in `.llm-wiki/page-history/` proved it. New `targetPageForFix()` extracts kebab-case slugs from the suggested-fix text, intersects with `affectedPages`, prefers the LAST match (LLMs phrase fixes as "X says Y but Z says W; update Z" — target appears later). Plus no-op detection on the server: if the LLM returns unchanged content, skip the write, return `noop: true`, UI shows amber "LLM made no change" instead of false success.

**Index drift fixed** (`b3a9261`): even after a successful Apply-suggested-fix on lov-grover, lint kept flagging the same "page says X but index says Y" contradiction on re-run. Root cause: `applyManualEdit` wrote the page file but never updated the matching summary line in `index.md`. The index entry for lov-grover ("…developed in 1994…") was generated from a snapshot of the page body at ingest time and went stale the moment the page was edited. New `refreshIndexEntryForSlug()` in `index-builder.ts` re-extracts a one-line summary via `firstSentence()` and updates just that entry. Called automatically from `applyManualEdit` and `createPage` — every page edit now keeps its index entry fresh. Bonus: `firstSentence()` regex updated to strip ANY bracketed content, not just kebab-case slugs, so `[[Mathematician]]` (the LLM had stuck non-slug text inside brackets) no longer leaks into rendered summaries.

### C. Lint history surface — `e34575a`, `48f64d1`, `0927a61`, `f5e2b4e`

User asked whether a lint history would be useful. Recommended a lightweight version, user said yes.

- **`lintWiki()` now appends to `log.md`** with the format docs/03 specified all along: `## [stamp] lint | N issues — health` + bullet detail. Sits alongside ingest / edit / schema entries so log.md becomes a single chronological timeline.
- **`previousRun` field** returned from lintWiki by reading the most-recent lint heading from log.md *before* appending the new one. UI shows "Previous run 2h ago: 19 issues · −15 fewer now" in green/amber.
- **Always-visible "Recent runs" panel** at the top of /lint (later request — initial implementation only showed the delta after a fresh run, which the user correctly noted wasn't useful before the second run). New `getLintHistory(wikiPath, limit)` helper + `GET /api/lint/history?limit=10`. Loaded on mount, refreshed after every successful lint.
- **`/log` page** — server-rendered view of log.md that splits by `## [` headings, reverses (newest first), renders each entry as a card with clickable `[[wikilinks]]` jumping to wiki pages. Replaced the "show the on-disk path + clipboard copy" footer with a `View full timeline →` link to `/log`.

### D. Perceived-perf pass — `39d5861`, `9a010f7`

User: *"I see small delay and stucking feeling while click on cards… not fast enough."* Real issue, not overthinking — Next.js App Router waits for the new route's server work to finish before swapping pages. During that wait (100ms–2s in dev), the user sees the **old page unchanged**.

Fixed with two layers:

- **`loading.tsx` files** at every heavy route (root, wiki, wiki/[slug], lint, log, sources, chats/[id]). Each renders a Suspense fallback the instant a Link is clicked. Four reusable skeleton variants in `components/loading-skeleton.tsx` (page-card-grid, article, list-of-cards, chat-with-messages) chosen per route to roughly mimic the actual layout — less jarring than a spinner.
- **`active:scale-[0.99]`** on every clickable card (wiki cards, home stat tiles, home action cards). Card snaps inward by 1% on click with a 100ms transition — immediate "click registered" feedback in the same frame as the click, even before the skeleton fires.

**Bonus bug fix** (`9a010f7`): the chats sidebar's `+ New chat` button rendered with near-black text in light mode (should have been cream-on-deep-red). Diagnosed: our `cn()` helper uses `tailwind-merge`; twMerge ships knowing the default Tailwind text-{size} scale but not our custom sizes (`text-display`, `text-h1`, `text-ui`, `text-caption`, etc.). When it saw `text-ui` next to `text-primary-foreground`, it had no way to tell which was font-size and which was color — and the className override won, dropping the color class. The button inherited body's near-black `text-foreground`. Fixed in `apps/web/src/lib/utils.ts` via `extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: [...] }] } } })`. Prevents this class of bug anywhere else a custom-size class collides with a color class on the same element.

### E. Editor width — `67530dc`

Schema editor and per-page edit view felt cramped — each column ~360–420px wide, fixed 480–560px tall. Looked unfinished. Added `xl` size to PageContainer (`max-w-[1400px]`); schema uses it directly, wiki PageView expands article from `max-w-3xl` (reading) to `max-w-[1400px]` when entering edit mode. Both panes now use `min-h-[calc(100vh-…)]` + matched border/padding/bg so the two sides look symmetric.

### F. /wiki redesign — `5ce3780`

The /wiki landing was just rendering index.md as raw markdown — looked like a debug view. Replaced with a card grid grouped by type (Overviews → Concepts → Entities → Comparisons → Sources). Each card has: type label, relative-time stamp, title in display font, line-clamp-3 summary, tag chips. Page header summarizes counts ("10 pages · 6 concepts · 4 entities · last update 2h ago"). Width bumped from `max-w-3xl` to `max-w-6xl` so 3 cards fit per row. Sidebar unchanged.

### G. Source lineage — `4a987ca`

Closes the user's "don't we lose data?" concern with UI. Every wiki page already had a `sources: [uuid]` frontmatter array + rows in the `page_sources` join table; we just never surfaced them. Two new surfaces:

- **`/sources/[id]` detail page** — server-renders metadata strip (format, size, dates, original URL/filename), "Contributed to N wiki pages" chips linking back to the pages this source compiled into, and the raw content rendered through MarkdownView. Binary files (PDF/image bytes detected via UTF-8 replacement char) show "open in your editor" instead of dumping garbage.
- **"Sources" section on every `/wiki/[slug]`** above Backlinks. Source chips link to `/sources/[id]`. Bidirectional graph traversal: any wiki page → its sources → all OTHER pages that source produced → those pages' sources → …

Sources list rows on `/sources` were also made into `Link`s to `/sources/[id]` (previously inert div rows).

### J. v1.0 release — README rewrite, version bump, GitHub release

After the graph view shipped, the project crossed the "this is genuinely a v1 product" threshold. Closed out the release prep:

- **README.md** completely rewritten. The prior 63-line draft referenced files that don't exist (CONTRIBUTING.md, docs/openrouter-setup.md) and an unpublished npm package (`@yasas/llm-wiki`). New ~200-line README is a real product page: gap-analysis table, full v1.0 feature inventory (with graph view), on-disk layout, install-from-source instructions, links to in-app docs (/about /help /developers) AND repo `/docs/*`, honest status section listing what shipped vs what's deferred to V1.x/V2, full stack table.
- **Version bumped 0.1.0 → 1.0.0** in `apps/web/package.json` and `apps/web/src/components/footer.tsx` `APP_VERSION`. Workspace packages stay at 0.0.0 (internal-only, workspace:* deps don't care).
- **`docs/04-features-v1.md` P1 #10** marked ✅ (wiki graph view shipped) with a pointer to `docs/12-graph-view.md`.
- **About / Help / Developers pages** woven with graph-view explanations during the previous session (commit `556cd31`) so the in-app docs are consistent with the README.
- **Git tag `v1.0.0`** + GitHub release with summary notes.

Open questions list (in §"Open questions for future sessions" below) is the authoritative work-needed list. The big rocks for V1.x are: diff view, approval gate, export-to-zip, production build, CLI npm publish.

### I. 3D Graph View — adds `docs/12-graph-view.md` + `/graph` route

User asked for an Obsidian-style 3D graph view ("knowledge as neural network") to make the wiki's compounding structure visible. Full design doc + decisions in **`docs/12-graph-view.md`**.

Shipped: new `packages/core/src/graph.ts` (`buildGraph(wikiPath, db)`) reusing the existing `uniqueLinkedSlugs` parser from `links.ts`; 7-test suite covers empty/single/linked/broken/self-link/dedupe/preview-strip cases. New `/graph` route with server component that calls `buildGraph`, dynamic-imports `react-force-graph-3d` (~600KB bundle hidden behind `ssr: false` so other routes don't pay). `vault-graph.tsx` client component handles the 3D scene + side panel + URL state (`?node=<slug>`) via `window.history.replaceState` so selection clicks don't trigger router re-renders. Theme reactivity via `MutationObserver` on `<html>` watching our `ThemeProvider`'s class toggle — WebGL canvas can't read CSS vars directly. Five hardcoded type colors (overview=red, concept=cyan, entity=amber, comparison=violet, source=slate) — restrained enough to look right in both light and dark modes. Node size scales with degree; selected node turns near-white, neighbors keep their color, non-neighbors dim to barely-visible — same focus mechanic Obsidian uses. New deps in apps/web only: `react-force-graph-3d` + `three`. Added `Graph` to PRIMARY_NAV after `Wiki`.

Two things deferred: a CLI `graph` subcommand printing stats+orphans (nice-to-have), and a 5th home-page action card (existing 4 already crowded). 2D toggle, search/filter overlay, persistent camera state are all V2.

### H. Doc pages: About / Help / Developers — `73fb90e`

User asked for "proper about page", a "developer page / doc page" set, and a wiki-style reference accessible to local + future cloud users.

- **`/about`** — Karpathy-pattern story, gap analysis (RAG vs. note-taking), who-it's-for grid (researchers, lawyers, doctors, journalists, educators, indie hackers), design principles, stack overview, credits to Yasas + Karpathy, MIT.
- **`/help`** — user-facing how-to. Mental model (3 layers + 3 ops), first-run setup, sources, wiki browsing, query vs. chats, lint with all fix types explained, schema editing, settings, on-disk folder layout, troubleshooting. With TOC. Like Wikipedia's `Help:` namespace.
- **`/developers`** — technical reference. Stack, monorepo layout (with directory tree), the three operations as code with file paths + entry points, JSON contracts, FTS5 + SQLite tables, how to add a source format, how to swap LLM providers, where prompts live, how lint quick-fixes dispatch, test suite locations, contributing pointers. Points back to `/docs/` on GitHub for the design contract.
- **Footer** updated with About / Help / Developers / GitHub / Pattern by Karpathy. Reachable from every screen.

---

## Open questions for future sessions

1. Should we ship `next-themes` instead of the homegrown ThemeProvider? Tradeoff: ~5KB dep vs. zero deps + a few extra lines.
2. Should models.ts pull pricing from OpenRouter's `/models` endpoint at runtime instead of hardcoding? More correct but adds latency + a cache layer.
3. Should the CLI use `tsx` to import from `@llm-wiki/core` instead of inlining init logic? Eliminates duplication but adds a runtime dep.
4. Is there value in a "watch mode" for sources? (User drops files into `raw/` from their file manager, app auto-ingests.) Mentioned in docs but deferred.
5. Per-source detail view: re-ingest, delete (with `page_sources` unlink), and "what pages did this produce" drill-down. Audited-but-deferred from 2026-05-24.
6. Should non-home routes also redirect to onboarding when the key/topic are missing? Today they fail loud at the API layer. Middleware-level redirect would be friendlier for direct bookmarks.
7. Per-page **diff view** when the LLM updates a page during ingest — docs/04 lists this as P1. Backups are written to `.llm-wiki/page-history/` already; a "show me what changed" view is the missing UI. Probably 1-2 hours.
8. **Approval gate** for ingest — also docs/04 P1. Today ingest is auto-apply; a "preview changes first" mode would suit researchers who don't trust the LLM blindly.
9. **Wiki graph view** (docs/04 P1) — force-directed visualization of [[wikilinks]] between pages. Nice-to-have, not critical. d3 or react-force-graph.
10. **Lint history view** beyond the inline "Recent runs" panel — a dedicated `/lint/history` or sparkline trend chart on the Lint page. Only worth building if the inline panel turns out to feel insufficient.
11. **Production build** — V1 ships via `pnpm dev` today. `next build` + `next start` would dramatically improve perceived perf (loading skeletons are a band-aid for dev-mode lazy compile). Standalone-bundle 500s noted in earlier sessions are still unresolved — needs Step 15 push.
12. **CLI polish (Step 15)** — `llm-wiki start` works but `pnpm pack` install has unresolved `workspace:*` dep issues. Blocks npm publish.
13. **Tauri / desktop installer (V2)** — would solve the production-build problem AND give us native file-open helpers (currently the source-detail page can't open the raw file in the user's editor because browsers can't open arbitrary file:// paths from a web context).
14. **Sources detail enhancements (carryover from audit #5)** — re-ingest, delete (with `page_sources` unlink + page-history backup of affected pages), extracted-markdown sibling view for binary formats.
15. **Loading skeleton coverage** — added to root, wiki, wiki/[slug], lint, log, sources, chats/[id]. NOT added to: schema, query, settings, chats (index), home, about, help, developers — those are client-heavy or instant-render. Revisit if any of them start to feel laggy.

---

## When in doubt

Read `CLAUDE.md` at the repo root + `docs/01-vision.md` through `docs/11-attribution-license.md`. They're the design contract; this dev log captures execution + drift from it.
