# 14 — Roadmap

**The single forward-looking view: what's left to do, sorted by priority.** Consolidated from "open questions" in `docs/dev-log.md`, "deferred" items in `docs/04-features-v1.md`, "future enhancements" in `docs/12-graph-view.md` / `docs/13-multi-wiki.md`, and known blockers across the codebase.

Last updated: **2026-05-24** (post-Q sprint: setup-gate / dashboard / production build / publishable tarball).

> If you're picking this project up cold, read `README.md` → `docs/01-vision.md` → this file → `docs/dev-log.md` in that order. You'll be operational in about 30 minutes.

---

## Status at a glance

- ✅ **v1.0.0 tagged + released** on GitHub
- ✅ All P0 + all P1 features shipped end-to-end
- ✅ 1 of 7 P2 features shipped early (multi-wiki); 6 still V2/V3
- ✅ V1.x sprint complete (10 items in section P + 4 more in section Q)
- ✅ Test suite: ~158 core + 25 llm + 11 ingestion ≈ **194 passing** (1 known chokidar flake)
- ✅ **Production build works** — `next build` standalone bundle serves every route (fixed 2026-05-24, dev-log Q)
- ✅ **Publishable tarball ready** — `pnpm build:publish` produces a clean `apps/web/dist-publish/` with no workspace deps; `npm publish --access public` from there is the last manual step

---

## V1.x — the next sprint(s)

Things that complete the V1 promise. Roughly ordered by impact-per-effort.

### Quick wins (≤ 1 hour each)

*All four V1.x quick wins shipped 2026-05-24 — see dev-log section P (P1–P4). Next items here once new ones surface.*

### Medium (1–3 hours each)

*All six V1.x medium items shipped 2026-05-24 (dev-log section P): per-page diff view (P1 #11), approval gate (P1 #12), export to zip (P1 #13), setup gate via page-level helper, wiki templates, cross-wiki search in Cmd+K. The "setup gate for client-only routes" carryover also shipped (dev-log Q1).*

### Bigger (3+ hours each)

*Production build, CLI npm publish-ready tarball, and Wiki health dashboard all shipped 2026-05-24 — see dev-log section Q.*

**Still open:**

- **The actual `npm publish --access public` invocation.** The tarball at `apps/web/dist-publish/` is built and verified end-to-end (installs cleanly into a temp dir, CLI boots the standalone server, every route returns 200). All that's left is the one-time user action to push it to npm under the `@yasas` scope.
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
- **Cloud-readiness prep — extract a `FileSystem` interface.** Pure refactor with no functional change. Today `packages/core/src/wiki.ts`, `index-builder.ts`, `editor.ts`, `chat.ts`, etc. all call `node:fs/promises` directly. Lift those calls behind a small interface (`readFile`, `writeFile`, `readdir`, `stat`, `mkdir`) so the file-IO layer is swap-able: local FS today, S3/R2 if a cloud version ever happens. Schedule alongside V2 Tauri work so the abstraction is informed by *two* consumers (local FS + Tauri webview) rather than designed for cloud in a vacuum. **Bonus**: cleaner test seams for everything that currently mocks file paths.

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
