# LLM Wiki

> **A personal Wikipedia an LLM maintains for you.** Drop in articles, papers, notes, PDFs, or URLs — an agent compiles them into a cross-linked markdown wiki you fully own. Knowledge compounds: each new source makes every page richer, not just one new page longer.

Open source · Local-first · Bring-your-own-key · MIT · v1.0

This is a from-scratch implementation of [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), released April 2026.

---

## Why this exists

| Existing tools | What they miss |
|---|---|
| **RAG chat** (NotebookLM, ChatGPT files) | Stateless. Rediscovers your corpus from scratch on every query. Never accumulates anything you can read later. |
| **Note-taking apps** (Obsidian, Notion) | All the maintenance burden on the human. You write, you cross-link, you check for contradictions. Nothing scales. |
| **LLM Wiki** | Sits between them. The LLM does the maintenance; the wiki accumulates value; you own the markdown files. |

After a few weeks of feeding it sources, you have a navigable, cited, deliberately-organized body of knowledge about whatever you care about — without ever having written a page yourself.

---

## What's in v1.0

### The three operations (Karpathy's pattern)

- **Ingest** — Drop a source (text / file / URL / PDF / image) → the LLM reads it + your existing wiki, writes new pages, updates older pages where context shifts, refreshes the index, logs the change. Each ingest is a *refactor pass*, not an append.
- **Query** — One-shot Q&A against the whole wiki with cited pages. "Save as wiki page" promotes useful answers into permanent entries.
- **Lint** — Two-pass health check: local scan (broken links, orphans) + LLM pass (contradictions, gaps, stale claims, missing pages). Every issue ships with **one-click fixes** — including LLM-powered ones that write the page edit for you.

### Workflow features

- **Sources page** — Add via paste, drag-and-drop, or URL. Auto-detects format. Cost preview before every ingest. Per-source detail view shows the raw text, contributing wiki pages, and metadata.
- **Wiki landing** — Cards grouped by type (Overviews → Concepts → Entities → Comparisons → Sources). Search/filter sidebar. Click any card → page view with backlinks + source lineage + inline edit.
- **3D Graph view** *(new in v1.0)* — Force-directed graph of every page and every `[[wikilink]]`. Same engine as Obsidian's 3D Graph plugin, but colored by **page type** (not free-form tag), so the structure of your knowledge is visible at a glance. Click-to-focus reveals neighbors; drag/scroll to orbit; URL-state for deep links. Spec: [`docs/12-graph-view.md`](docs/12-graph-view.md).
- **Chats** — Multi-turn conversations saved as `.md` files in folders. Per-message "Save as wiki page" + whole-chat "Ingest → wiki" buttons close the loop from exploratory thinking back into the permanent layer.
- **Schema editor** — Edit the `CLAUDE.md` contract the LLM reads on every operation. Split-pane preview, auto-backup to `.llm-wiki/schema-history/`.
- **Log timeline** — `/log` shows every ingest / edit / lint / schema-save in chronological order. Wikilinks inside log entries are clickable.

### Quality / safety

- **First-run gate** — A real wizard collects the wiki topic + OpenRouter key before letting you wander. No silent failures on first ingest.
- **Page-history backups** — Every page edit (manual or LLM-driven) backs up the prior version to `.llm-wiki/page-history/`.
- **Cost transparency** — Estimated cost shown before every LLM operation; running cumulative tally in Settings → Costs.
- **Source lineage** — Every wiki page lists which raw sources it was compiled from; every source lists which wiki pages it contributed to. Bidirectional graph traversal.
- **Index integrity** — `index.md` auto-refreshes on every page edit. Click "Rebuild index" anytime for a full re-sweep.

### Settings

Five model slots tunable per-operation: `ingest` / `query` / `chat` / `lint` / `vision`. Curated dropdowns + custom-slug field for anything OpenRouter supports. Light / dark / auto theme. OpenRouter key stored in OS keychain when available.

---

## The on-disk shape

```
~/llm-wiki-default/                  # your wiki folder (set with LLM_WIKI_PATH)
├── CLAUDE.md                        # the schema you edit at /schema
├── index.md                         # auto-maintained catalog of pages
├── log.md                           # every operation, browsable at /log
├── raw/                             # original source files, untouched
├── wiki/                            # LLM-maintained pages (Markdown + frontmatter)
├── chats/                           # chat threads as .md files
└── .llm-wiki/                       # SQLite metadata + page-history + schema-history
```

Everything is plain markdown. Delete the app, open the folder in Obsidian / VS Code / vim — your wiki still works.

---

## Install + run

### Prerequisites

- **Node** ≥ 18.17 (`node --version`)
- **pnpm** ≥ 8 (`npm install -g pnpm` if missing)
- An [**OpenRouter API key**](https://openrouter.ai/keys) — pay-as-you-go, gives access to Claude / GPT / Gemini / Llama / more from one key

### From source (current path)

```bash
git clone https://github.com/ddsyasas/llm-wiki.git
cd llm-wiki
pnpm install
pnpm --filter @llm-wiki/web dev
```

Open `http://localhost:3000` → the first-run wizard walks you through topic + API key. Done.

By default the wiki lives at `~/llm-wiki-default`. Point at a different folder:

```bash
export LLM_WIKI_PATH=~/my-research-wiki
pnpm --filter @llm-wiki/web dev
```

### CLI (Step 13, in-tree but not yet published to npm)

```bash
node apps/web/bin/llm-wiki.mjs start [folder]
```

Subcommands: `start`, `init`, `config`, `doctor`, `version`. See [`docs/09-cli-distribution.md`](docs/09-cli-distribution.md). npm publish is open work — see "Status" below.

### Recovery / stuck-port / common gotchas

See [`docs/dev-setup.md`](docs/dev-setup.md).

---

## Documentation

The app ships with three in-browser doc pages, reachable from the footer on every screen:

| In-app | For |
|---|---|
| [`/about`](apps/web/src/app/about/page.tsx) | Story, Karpathy framing, who-it's-for, design principles |
| [`/help`](apps/web/src/app/help/page.tsx) | User-facing how-to (every feature explained, TOC, troubleshooting) |
| [`/developers`](apps/web/src/app/developers/page.tsx) | Stack, monorepo tree, the three operations as code, JSON contracts, extension recipes |

For the **design contract** + execution history, see `/docs` in this repo:

| Spec | What it covers |
|---|---|
| [`01-vision.md`](docs/01-vision.md) | What this is and who it's for |
| [`02-architecture.md`](docs/02-architecture.md) | Stack, repo layout, distribution |
| [`03-data-model.md`](docs/03-data-model.md) | On-disk structure + SQLite schema |
| [`04-features-v1.md`](docs/04-features-v1.md) | Exact V1 feature scope (with shipped/deferred status) |
| [`05-llm-integration.md`](docs/05-llm-integration.md) | OpenRouter, prompts, JSON contracts |
| [`06-ingest-pipeline.md`](docs/06-ingest-pipeline.md) | How sources become wiki pages |
| [`07-chat-threads.md`](docs/07-chat-threads.md) | Chat feature spec |
| [`08-ui-design.md`](docs/08-ui-design.md) | Design language and key screens |
| [`09-cli-distribution.md`](docs/09-cli-distribution.md) | CLI behavior and npm packaging |
| [`10-build-order.md`](docs/10-build-order.md) | Sequenced build plan |
| [`11-attribution-license.md`](docs/11-attribution-license.md) | Naming, credits, license |
| [`12-graph-view.md`](docs/12-graph-view.md) | 3D graph view design + decisions (v1.0 addition) |
| [`dev-log.md`](docs/dev-log.md) | **Execution history + open questions.** Read this first when picking up the project. |
| [`dev-setup.md`](docs/dev-setup.md) | Run / stop / recover / troubleshoot |

---

## Project status (v1.0)

**All P0 features shipped.** All three Karpathy operations (ingest / query / lint) wired end-to-end with cost previews, error recovery, and one-click fixes. Chats, schema editor, settings, log timeline, source-lineage UI, and the 3D graph view all live.

**Test suite**: ~140 core + 17 llm + 11 ingestion = ~168 passing tests. (One chokidar live-watch test is a known flake.)

**Deferred to V1.x or V2** (tracked in [`docs/dev-log.md`](docs/dev-log.md) open questions):

- Per-page **diff view** when LLM updates a page (P1 #11)
- **Approval gate** for ingest (preview changes before applying) (P1 #12)
- **Export wiki to zip** (P1 #13)
- **Per-source re-ingest / delete** + extracted-markdown view for binary formats
- **Onboarding gate on non-home routes** (direct-bookmark UX)
- **Production build** (`next build`) — V1 currently ships via `pnpm dev`
- **CLI npm publish** — `pnpm pack` workspace:* deps blocker
- **Tauri desktop installer** (V2)
- **MCP server mode** (V3)
- **2D toggle / search overlay / persistent camera state** for the graph

---

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript strict |
| Framework | Next.js 14 (App Router) |
| UI | React, Tailwind, shadcn-style primitives, Fraunces / Crimson Pro / Inter / JetBrains Mono |
| Storage | Plain markdown + SQLite (`better-sqlite3`) for metadata, FTS5 for search |
| LLM | OpenRouter via `openai` npm SDK (BYOK) |
| Schema validation | `zod` |
| Frontmatter | `gray-matter` |
| File watch | `chokidar` |
| Source extractors | `mammoth` (DOCX), `officeparser` (XLSX/PPTX), `@mozilla/readability` (HTML/URL), vision models for PDF/image |
| Graph view | `react-force-graph-3d` + `three.js` |
| Secrets | OS keychain via `keytar`, with chmod-600 file fallback |
| Tests | `vitest` |
| Package manager | `pnpm` workspaces |

Hard rules from the design contract: **TypeScript everywhere** (no Python sidecars), **cross-platform from day one** (Mac, Windows, Linux), **no Electron / Tauri / React Native in V1** (the app is a local Next.js server you run yourself).

---

## Contributing

PRs welcome. Before opening one:

1. Read [`CLAUDE.md`](CLAUDE.md) at the repo root — the do/don't list.
2. Skim [`docs/01-vision.md`](docs/01-vision.md) for the design contract — V1 scope is deliberately small.
3. Check [`docs/dev-log.md`](docs/dev-log.md) "Open questions for future sessions" — that's the work-needed list.
4. Run the tests: `pnpm -r --filter @llm-wiki/core test --run`
5. Typecheck: `pnpm -r exec tsc --noEmit`

---

## Credits

Built by **[Yasas](https://github.com/ddsyasas)** as a from-scratch implementation of the LLM Wiki pattern described by **[Andrej Karpathy](https://karpathy.ai/)** in his April 2026 [gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Not affiliated with Andrej Karpathy or Anthropic. The pattern is his, the implementation is independent.

---

## License

MIT. See [LICENSE](LICENSE).
