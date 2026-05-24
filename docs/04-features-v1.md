# 04 Features V1

The scope of V1 is defined here. Anything not listed is out of scope for V1, even if mentioned elsewhere.

> **Status note (2026-05-24):** v1.0.0 is tagged. **All P0 shipped.** P1 #10 (graph view) shipped post-tag. P1 #11–#13 (diff view / approval gate / export-to-zip) are deferred to V1.x. Several **post-V1** features also shipped early — see "Post-V1 features already shipped" below. The forward-looking work-needed view lives in [`docs/14-roadmap.md`](14-roadmap.md).

## Feature list with priorities

### P0, must ship in V1

1. **CLI install and start**
   - `llm-wiki start [folder]` boots the server and opens browser
   - First-run wizard if folder isn't initialized
   - API key setup wizard if no key configured

2. **Source ingestion**
   - Upload files via UI (drag-drop or file picker)
   - Paste text directly
   - Paste a URL (fetch and clean)
   - Supported formats: PDF, DOCX, PPTX, XLSX, HTML, MD, TXT, PNG, JPG
   - Progress feedback during ingestion
   - Each ingest produces: new pages, page updates, index update, log entry

3. **Wiki browsing**
   - Sidebar list of all pages with search filter
   - Page view with rendered markdown
   - Clickable cross-links between pages
   - Backlinks panel at bottom of each page
   - Edit any page manually with built-in editor

4. **Query mode**
   - One-off question, no thread saved
   - Streaming answer with citations
   - Click citations to jump to pages
   - "Save as wiki page" button to promote a useful answer

5. **Chat threads**
   - Start a new chat from any page or from the chats view
   - Save automatically as `.md` files in `chats/`
   - Organize into folders (create, rename, move chats)
   - Search across all chats
   - Pin important chats
   - Delete and archive
   - "Promote this answer to wiki page" action on any assistant message

6. **Lint operation**
   - Manual trigger, "Run lint" button
   - Reports: contradictions, orphans, missing pages, broken links, stale claims, gaps
   - Quick-fix buttons for easy issues (rename broken link, etc.)
   - Suggests follow-up questions to investigate gaps

7. **Schema editor**
   - Edit `CLAUDE.md` from the UI
   - Live preview
   - Versioning (keep last 10 versions in `.llm-wiki/schema-history/`)

8. **Settings**
   - OpenRouter API key (stored in OS keychain when possible)
   - Model selection per operation type
   - Show or hide cost estimates
   - Toggle auto-lint after each ingest

9. **Cost transparency**
   - Show estimated cost before running any operation
   - Show actual cost after running
   - Settings page shows cumulative token usage per model

### P1, ship if time allows

10. **Wiki graph view** (force-directed visualization of page links) — ✅ **shipped 2026-05-24**, see [`docs/12-graph-view.md`](12-graph-view.md). 3D scene at `/graph`, color by page type, click-to-focus + side panel + URL state.
11. **Diff view** when LLM updates a page (highlight changes) — ✅ **shipped 2026-05-24**, see dev-log section P6. `/wiki/<slug>/history` route with backup picker + line-by-line unified diff.
12. **Approval gate** for ingestion (review changes before applying) — ✅ **shipped 2026-05-24**, see dev-log section P5. Toggle in Settings → General; preview UI on /sources with Apply / Discard.
13. **Export wiki to a zip** including all assets — ✅ **shipped 2026-05-24**, see dev-log section P4. `/api/wikis/export` streams a zip; download link in Settings → Wikis.

### P2, post-V1

- Tauri desktop installer (V2) — ❌ V2
- MCP server mode (V3) — ❌ V3
- Multi-wiki management UI — ✅ **shipped 2026-05-24** as the in-app wiki switcher, see [`docs/13-multi-wiki.md`](13-multi-wiki.md)
- Scheduled lint runs — ❌ V2
- Embeddings-based search — ❌ V2
- Ollama support — ❌ V2 (workable today by changing the OpenRouter base URL in `packages/llm/src/client.ts`, but no UI)
- Plugin system — ❌ V3

### Post-V1 features already shipped

Sometimes a P1 / P2 item became cheap to do alongside something else, or a need surfaced that wasn't in the original V1 spec. These shipped after v1.0.0 was tagged:

- **3D graph view** — see P1 #10 above
- **In-app multi-wiki switcher** — see P2 above; spec at [`docs/13-multi-wiki.md`](13-multi-wiki.md)
- **First-run welcome wizard** (4-step Welcome → Topic → Key → Tour) — dev-log section M
- **Lint quick-fixes** beyond remove-broken-link: bulk remove all broken, rebuild index (local), create stub page (LLM), apply suggested fix (LLM) — dev-log section B
- **Lint history** appended to `log.md` + Recent Runs panel on /lint with the delta to previous run — dev-log section C
- **Browseable `log.md`** at `/log` — dev-log section C
- **Source lineage UI** — Sources section on every wiki page + `/sources/[id]` detail with raw content + "contributed to N pages" chips — dev-log section G
- **About / Help / Developers in-app doc pages** — sections H (and woven graph + multi-wiki references in later sprints)
- **Header active-wiki chip + dropdown** + Cmd+K wiki-switch actions — dev-log section L
- **Asymmetric Claude-style chat layout** — commit `087a51a`
- **Loading skeletons + click-state feedback** on cards — dev-log section D
- **Defensive JSON parse** in the LLM client (strips ```json fences) — dev-log section A
- **GitHub repo SEO topics** — applied 2026-05-24, 18 topics
- **Per-source Retry + Delete actions** with bulk "clean up pending" — dev-log section N
- **Graceful ingest schema** — `indexEntries[].summary` now truncates instead of failing validation when the LLM drifts past the char cap (dev-log section N)
- **Wiki page delete** with soft-trash + backlinks-aware confirm dialog + one-click Undo banner — dev-log section O
- **Generalized trash purge** — `.llm-wiki/trash/` now contains `chats/`, `wiki/`, `raw/` subdirs, all auto-pruned after 30 days (dev-log section O)
- **V1.x sprint (10 items)** — mobile-chip + replay-tour + footer-hint + setup-gate + Cmd+K theme/copy/cross-wiki + wiki templates + per-page diff view + approval gate + export-to-zip — dev-log section P

## Acceptance criteria

A feature is done when ALL of these are true:

1. The feature works end-to-end in the UI
2. There's automated test coverage for the core logic in `packages/core` or `packages/ingestion`
3. Errors are surfaced to the user as a toast or inline message, not just thrown
4. Empty states are handled (no pages, no chats, no sources)
5. Loading states are handled (spinners, disabled buttons during async ops)
6. The operation logs an entry to `log.md` where applicable
7. Token usage is recorded in SQLite where applicable

## Critical UX rules

- **No silent failures.** Any operation that can fail must report success or failure to the user.
- **No data loss.** Never overwrite a page without keeping a backup (`.llm-wiki/page-history/`).
- **No surprise costs.** Never run an expensive operation without showing the estimated cost first.
- **No blocking UI.** Long operations stream progress. The user can keep browsing the wiki during ingestion.
- **No lock-in.** Every feature should leave usable markdown files behind. If the user uninstalls, their wiki still works.

## What V1 does NOT include

Be explicit about these so they don't creep in:

- No collaboration features (single user)
- No mobile app or mobile-responsive design (desktop browser only)
- No internationalization, English only
- No cloud sync (use git or Dropbox manually)
- No fancy WYSIWYG editor (plain markdown only)
- No model fine-tuning or training
- No web search integration during query (V1 only reads the wiki)
- No image generation
- No PDF export of wiki

## Definition of "V1 ready to publish"

We can publish to npm and announce when:
- All P0 features complete and tested
- Install flow works on fresh Mac, Windows, and Linux
- README walks a new user from install to first useful query
- OpenRouter setup guide is clear and tested
- No known data-loss bugs
- License file is in place
- Attribution is correct in UI and docs
