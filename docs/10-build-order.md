# 10 Build Order

This document is the master build plan. Follow these steps in order. Don't skip ahead. Each step should produce working, testable output before moving on.

## Step 0: Repo skeleton

Goal: get a working monorepo that builds and runs.

1. Initialize pnpm workspace
   - Create `package.json` at root with `"private": true` and `"workspaces"`
   - Create `pnpm-workspace.yaml` pointing at `apps/*` and `packages/*`
2. Initialize `apps/web/` as a Next.js 14+ app with App Router, TypeScript, Tailwind
3. Create stub packages: `packages/core`, `packages/ingestion`, `packages/llm`
   - Each has its own `package.json`, `tsconfig.json`, `src/index.ts`
4. Set up TypeScript project references between them
5. Install shadcn/ui in the web app and verify a button renders
6. Add ESLint, Prettier, Vitest at the root level
7. Add `.gitignore` covering `node_modules`, `.next`, `*.tsbuildinfo`, `dist`
8. Add `LICENSE` (MIT), `README.md`, copy `CLAUDE.md` and `docs/` from setup

**Done when**: `pnpm dev` runs the web app at localhost:3000 with a hello-world page that imports something from `packages/core`.

## Step 1: Wiki folder I/O

Goal: read and write the wiki folder structure.

1. In `packages/core/src/wiki.ts`, implement:
   - `initWikiFolder(path)`: create directories and stub files
   - `readPage(wikiPath, slug)`: parse frontmatter and content
   - `writePage(wikiPath, slug, page)`: write with frontmatter
   - `listPages(wikiPath)`: scan `wiki/` directory
   - `readIndex(wikiPath)`: read `index.md`
   - `writeIndex(wikiPath, indexContent)`: write `index.md`
   - `appendLog(wikiPath, entry)`: append to `log.md`
   - `readSchema(wikiPath)`: read `CLAUDE.md`
2. Use `gray-matter` for frontmatter parsing
3. Write unit tests in `packages/core/src/wiki.test.ts`

**Done when**: tests pass and I can manually verify by initializing a folder and listing pages.

## Step 2: SQLite metadata layer

Goal: persistent metadata store.

1. In `packages/core/src/db.ts`, implement:
   - `openDb(wikiPath)`: returns a `better-sqlite3` Database instance
   - `runMigrations(db)`: creates tables per `docs/03-data-model.md`
   - Repository functions: `getPage`, `insertPage`, `updatePage`, `deletePage`, similar for sources, chats, usage
2. Add startup logic that opens the DB and runs migrations
3. Tests: create in-memory DB, run migrations, assert tables exist

**Done when**: DB is created on first wiki access and tables are present.

## Step 3: File-system to DB sync

Goal: keep SQLite in sync with the wiki folder files.

1. In `packages/core/src/sync.ts`, implement:
   - `syncWikiToDb(wikiPath, db)`: full scan, update DB rows where mtime differs
   - `watchWiki(wikiPath, db, onChange)`: live watch via `chokidar`
2. Wire this into app startup

**Done when**: I can edit a `.md` file in `wiki/` with my editor and the app picks up the change.

## Step 4: OpenRouter client

Goal: working LLM call.

1. In `packages/llm/src/client.ts`, implement:
   - `createClient(apiKey)`: factory for OpenAI SDK pointed at OpenRouter
   - `callLLM<T>(opts)`: wraps `chat.completions.create`, parses JSON, validates with zod
   - Retry logic for transient errors
2. In `packages/llm/src/models.ts`, define `DEFAULT_MODELS` and a `getPricing(model)` function
3. Add a smoke test that requires an API key in env: makes one call to a cheap model and verifies response

**Done when**: I can call `callLLM` with a test schema and get a parsed response back.

## Step 5: Config and key management

Goal: store API key safely, load it on startup.

1. In `packages/core/src/config.ts`, implement:
   - `loadGlobalConfig()`: reads `~/.llm-wiki/config.json`, returns parsed
   - `saveGlobalConfig(config)`: writes it back
   - `loadWikiSettings(wikiPath)`: reads `.llm-wiki/settings.json`
   - `saveWikiSettings(wikiPath, settings)`
2. Use `keytar` for API key, fall back to plain config file with a permissions warning
3. Wire into Next.js API routes via a shared `getConfig()` helper

**Done when**: API key can be set via UI or CLI and persists.

## Step 6: Ingest pipeline (text only)

Goal: ingest a plain-text or markdown source end-to-end.

1. In `packages/ingestion/src/`, build only `markdown.ts`, `plain.ts`, and `detect.ts` for now
2. In `packages/core/src/ingest.ts`, implement `ingestSource`:
   - Build prompt from schema, index, relevant pages, source
   - Call LLM with `IngestResponseSchema`
   - Apply the response: write new pages, update existing, rebuild index, append log
3. Add API route `POST /api/ingest` in `apps/web/src/app/api/ingest/route.ts`
4. Build a basic Sources page in the UI with a textarea + "Ingest" button

**Done when**: I can paste text, click ingest, and see new wiki pages appear in the folder.

## Step 7: Wiki view UI

Goal: browse the wiki in the browser.

1. Build the app shell with the header nav
2. Wiki sidebar component with page list and search filter
3. Markdown renderer that handles `[[wikilinks]]`
4. Page view with backlinks
5. Inline edit mode with markdown textarea + save

**Done when**: I can browse pages, click cross-links, and edit a page.

## Step 8: More source formats

Goal: support all V1 source types.

Build in this order:
1. `html.ts` and `url.ts` (Readability + Turndown)
2. `docx.ts` (mammoth)
3. `pptx.ts`, `xlsx.ts` (officeparser)
4. `pdf.ts` (pass-through to vision model)
5. `image.ts` (pass-through to vision model)

For each: add file upload to UI, route through the right parser, then ingest.

**Done when**: dragging a PDF, DOCX, or image into the Sources view results in a successful ingest.

## Step 9: Query mode

Goal: one-off questions with citations.

1. In `packages/core/src/query.ts`, implement `queryWiki`
2. API route `POST /api/query`
3. Query view in UI with streaming text and citation pills
4. "Save as wiki page" action

**Done when**: I can ask a question, see citations, and promote the answer to a wiki page.

## Step 10: Chat threads

Goal: persistent conversations as `.md` files.

1. In `packages/core/src/chat.ts`, implement:
   - `createChat(wikiPath, folder)`: returns new chat id and filename
   - `appendMessage(wikiPath, chatId, role, content)`: writes to file, updates DB
   - `listChats(wikiPath, folder?)`: from DB
   - `moveChat`, `renameChat`, `deleteChat`, `pinChat`
2. API routes for each
3. Chat view UI: folder list + thread list + active chat
4. Promote-message-to-wiki-page flow

**Done when**: I can have a multi-turn chat, switch between chats, organize them into folders.

## Step 11: Lint operation

Goal: health checks.

1. In `packages/core/src/lint.ts`, implement `lintWiki`
2. API route `POST /api/lint`
3. Lint view in UI with results table and quick-fix buttons

**Done when**: lint runs, returns issues, and I can apply a fix.

## Step 12: Schema editor and settings

Goal: edit `CLAUDE.md` and configure models.

1. Schema editor page with monaco editor + preview
2. Settings page with all tabs from `docs/08-ui-design.md`
3. Cost tracking page showing token usage from SQLite

**Done when**: All settings persist and changes take effect immediately.

## Step 13: CLI entry

Goal: shippable as an npm package.

1. Create `apps/web/bin/llm-wiki.mjs` per `docs/09-cli-distribution.md`
2. Implement commands: `start`, `init`, `config`, `doctor`, `version`
3. Add port detection, browser auto-open
4. Wire `package.json` `bin` field

**Done when**: `pnpm pack` produces a tarball I can install globally and run from any folder.

## Step 14: Polish and edge cases

Final pass before publish:

1. Error states: every API route returns proper errors, UI shows them as toasts
2. Empty states: every view has a designed empty state
3. Loading states: all async ops show progress
4. Cost previews: shown before any expensive operation
5. Backups: page edits create entries in `.llm-wiki/page-history/`
6. Trash: deleted chats go to `.llm-wiki/trash/chats/` for 30 days
7. Keyboard shortcuts wired up
8. Command palette (Cmd+K) working
9. Attribution in UI footer

## Step 15: Documentation and publish

1. Write `INSTALL.md`, `OPENROUTER_SETUP.md`, `MODELS.md`, `TROUBLESHOOTING.md` in `docs/`
2. Polish `README.md` with screenshots and quickstart
3. Verify install on Mac, Windows (WSL), Linux
4. Tag `v0.1.0`
5. Publish to npm as `@syasas/llm-wiki` (or your actual scope)
6. Announce wherever you announce things

## What to skip in V1

Do NOT build these even if tempted; they're V2+:
- Graph view (force-directed page link visualization)
- Embeddings-based search (FTS5 is enough at V1 scale)
- Multi-wiki management UI
- Mobile-responsive design
- Tauri desktop wrapper
- MCP server endpoints
- Ollama support
- Scheduled lint
- Plugin system

## Estimated time

For one person working evenings with Claude Code:
- Steps 0-5: weekend (foundation)
- Steps 6-10: 1-2 weeks (core features)
- Steps 11-13: 1 week (operations and CLI)
- Steps 14-15: 1 week (polish and launch)

Total: about 4-5 weeks to a shippable V1.
