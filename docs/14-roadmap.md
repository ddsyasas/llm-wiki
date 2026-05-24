# 14 — Roadmap

**The single forward-looking view: what's left to do, sorted by priority.** Consolidated from "open questions" in `docs/dev-log.md`, "deferred" items in `docs/04-features-v1.md`, "future enhancements" in `docs/12-graph-view.md` / `docs/13-multi-wiki.md`, and known blockers across the codebase.

Last updated: **2026-05-24** (post-v1.0.0 release).

> If you're picking this project up cold, read `README.md` → `docs/01-vision.md` → this file → `docs/dev-log.md` in that order. You'll be operational in about 30 minutes.

---

## Status at a glance

- ✅ **v1.0.0 tagged + released** on GitHub
- ✅ All P0 features (`docs/04-features-v1.md`) shipped end-to-end
- ✅ 1 of 4 P1 features shipped (graph view); 3 deferred to V1.x
- ✅ 1 of 7 P2 features shipped early (multi-wiki); 6 still V2/V3
- ✅ ~10 post-V1 enhancements shipped on top (first-run wizard, lint quick-fixes, source lineage, doc pages, header chip, asymmetric chat, etc.)
- ✅ Test suite: ~145 core + 17 llm + 11 ingestion = ~173 passing (1 known chokidar flake)
- ⚠ Runs via `pnpm dev` only — `next build` standalone bundle has unresolved 500s
- ⚠ CLI works in-tree but **not yet on npm** — workspace:* packaging blocker

---

## V1.x — the next sprint(s)

Things that complete the V1 promise. Roughly ordered by impact-per-effort.

### Quick wins (≤ 1 hour each)

- **Active-wiki indicator on small screens.** Header chip is `hidden sm:block`; mobile users have no quick-switch affordance. Either show it in the hamburger menu or add a separate compact variant.
- **"Replay welcome tour" button** in Settings → About. The 4-step wizard only fires once; some users want to re-watch it. Single button that POSTs a flag-clear and navigates to `/`.
- **Footer "active wiki" hint.** Tiny text "Currently editing: <topic>" in the footer alongside the version. Belt-and-suspenders to the header chip.
- **Cmd+K** — add "Toggle theme", "Open active wiki folder in editor" actions.
- **Per-source actions on `/sources`**: re-ingest (re-run the existing source through the LLM, e.g. when you've switched to a smarter model), delete (with `page_sources` cascade + page-history backup of any affected pages).

### Medium (1–3 hours each)

- **Per-page diff view when LLM updates a page** (P1 #11 from docs/04). Backups already exist at `.llm-wiki/page-history/`; just need a `/wiki/<slug>/history` route + diff renderer (use a diff library like `diff` or write a simple line-diff).
- **Approval gate for ingestion** (P1 #12). Today ingest is auto-apply. Add a "review changes before applying" mode toggle in Settings → General. When on, ingest returns the planned changes as a preview; user clicks Apply to commit.
- **Export wiki to zip** (P1 #13). Stream a `.zip` of `<wikiPath>/{CLAUDE.md, index.md, log.md, raw/, wiki/, chats/}` via a new `GET /api/wikis/<id>/export` route. Skips `.llm-wiki/` (regenerable).
- **Onboarding gate on non-home routes.** Direct-bookmark to `/wiki` with no API key currently fails loud at the API. Middleware that redirects to `/` when key/topic missing.
- **Wiki templates on Create.** Pre-fill `CLAUDE.md` from Research / Legal / Clinical / Project / Personal templates. Library of starter schemas committed to the repo.
- **Quick switcher in command palette: "Search across all wikis"** — currently FTS5 is scoped to the active wiki. Cross-wiki search would need a separate query path that iterates registered wikis.

### Bigger (3+ hours each)

- **Production build (`next build`).** v1.0 ships via `pnpm dev` only because the standalone bundle had unresolved 500s in earlier session work. Worth picking up — would eliminate the "first click to a route is slow" dev-mode lag entirely.
- **CLI npm publish.** `pnpm pack` against `workspace:*` deps doesn't produce a clean tarball. Options: switch internal deps to file: refs at publish time, or bundle packages into the CLI (esbuild / tsup).
- **Wiki health dashboard.** New surface aggregating: per-wiki page count + sources + chats + last-touched + cumulative cost. Sort across wikis by recency. Would live at `/dashboard` or similar.
- **Persistent camera state on /graph.** Remember the last camera position when returning. Requires storing camera state in URL or localStorage.
- **Local-model support (Ollama).** Workable today by changing the OpenRouter base URL in `packages/llm/src/client.ts`, but no UI. Add a "Provider" picker in Settings → Models with sensible defaults per provider (OpenRouter / Anthropic direct / OpenAI direct / Ollama).
- **Scheduled lint runs.** Cron-style: "Run lint nightly and append the result to log.md". V1.x if there's demand; needs an in-process scheduler or a CLI subcommand.

---

## V2

Material shifts in the product, not just polish on V1.

- **Tauri desktop installer.** Single-binary native app for Mac / Windows / Linux. Removes the Node prerequisite, lets us open raw files in the user's editor (browser sandboxes block `file://`), enables proper menubar / dock integration. **Big payoff** for non-technical users (per docs/01).
- **URL-namespaced multi-wiki** (`/w/<id>/wiki`, `/w/<id>/graph`, etc.). Lets users browse multiple wikis simultaneously in different browser tabs. Builds on V1.x multi-wiki switcher.
- **Embeddings-based search.** Today FTS5 covers keyword matches; vector search would handle "find me anything about quantum supremacy even if it's phrased differently." OpenAI / Voyage / local embeddings via Ollama.
- **2D toggle on `/graph`.** `react-force-graph-2d` has near-identical API; users on weak GPUs or who prefer flat views would benefit.
- **Multi-user / shared wikis.** Out of V1 scope by design (docs/01 non-goal), but inevitable if someone runs the project on a NAS or wants a team knowledge base. Auth, ACLs, conflict resolution all become real.
- **Live wiki sync via chokidar** — already half-built. Wire the file watcher to `revalidatePath()` so external edits (Obsidian, vim) show up live in the browser.
- **Lint history sparklines / dedicated `/lint/history` view.** Right now the Recent Runs panel shows N rows; a sparkline of issue count over time would be a nice visual.

---

## V3 and beyond

- **MCP server mode** — expose the wiki as an MCP server so other AI tools (Claude Desktop, future agents) can use it as memory. Read-only initially; write access for ingest later.
- **Plugin system** — let users add their own extractors, prompts, lint rules. Long way off; the surface area we'd commit to supporting is large.
- **Cloud-hosted version.** Docs/01 non-goal but inevitable demand. Would need: auth, per-user wikis, billing, SaaS chrome. Different product, same core.

---

## Known issues / bugs

- **Chokidar live-watch test is a flake** — fails ~1 in 5 runs locally (`packages/core/src/sync.test.ts`). Not blocking; race in the test setup, not the production code.
- **Standalone bundle 500s** — `next build && next start` from a standalone bundle returns 500s for API routes. Needs investigation. Blocks the "production build" item above.
- **No middleware-level onboarding gate** — direct-bookmark to a route without API key/topic just fails loud at the API layer. Home page has the gate; other routes don't.

---

## Cross-cutting tech debt

- **Workspace `version` fields stuck at 0.0.0** in `packages/core`, `packages/llm`, `packages/ingestion`. Not a real issue (they're workspace:* deps), but synchronizing all packages to 1.0.0 would make `gh release` notes more accurate.
- **No CI yet.** No GitHub Actions workflow runs tests + typecheck on PRs. Easy add for any contributor who wants their first PR to be infrastructure.
- **No automated changelog.** Each release manually edits dev-log.md. A conventional-commits → CHANGELOG.md pipeline (or just `auto-changelog`) would save 5 min per release.
- **Some Tailwind class collisions** still possible — fixed the `text-{custom-size}` vs `text-{color}` case in `apps/web/src/lib/utils.ts` (dev-log section D bonus), but future custom utilities could re-introduce similar bugs. Periodic review of `extendTailwindMerge` config.

---

## How to use this file

- **Picking a contribution?** Start with "Quick wins" — they're scoped to fit a single coding session and unlock value immediately.
- **Planning a sprint?** Look at "V1.x" — three medium items make a satisfying session.
- **Scoping V2?** The "V2" section is intentional product direction. Tauri is the biggest payoff for the audience docs/01 targets.
- **Adding a new item?** Edit this file directly. Order roughly by impact-per-effort within each section.

When something here ships, **move the entry to `docs/dev-log.md`** as a dated section (sections K, L, M etc.) and delete it from here. This file is forward-looking only.
