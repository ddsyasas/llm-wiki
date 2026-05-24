# 04 Features V1

The scope of V1 is defined here. Anything not listed is out of scope for V1, even if mentioned elsewhere.

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

10. **Wiki graph view** (force-directed visualization of page links) — ✅ **shipped 2026-05-24**, see `docs/12-graph-view.md`. 3D scene at `/graph`, color by page type, click-to-focus + side panel + URL state.
11. **Diff view** when LLM updates a page (highlight changes)
12. **Approval gate** for ingestion (review changes before applying)
13. **Export wiki to a zip** including all assets

### P2, post-V1

- Tauri desktop installer (V2)
- MCP server mode (V3)
- Multi-wiki management UI
- Scheduled lint runs
- Embeddings-based search
- Ollama support
- Plugin system

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
