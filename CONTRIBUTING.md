# Contributing to LLM Wiki

Thanks for considering a contribution. This file exists because the app looks "done" — it ships features, has tests, is on npm — but a lot of meaningful work remains, and it's not obvious from the outside what would actually help. Below is a clear "what we need and where this is going" so you can pick something worth your time.

> **Never sent a pull request before?** Read **[docs/contributor-walkthrough.md](docs/contributor-walkthrough.md)** first — it walks through fork / clone / branch / commit / push / PR step by step with exact commands. Come back here once you've got that workflow down.

> If you only read one other file beyond this one: [`docs/01-vision.md`](docs/01-vision.md) explains *what this is and isn't*, and [`docs/14-roadmap.md`](docs/14-roadmap.md) has the full open-work list this file summarizes.

---

## Where this project is going

Three tiers, in priority order:

**V1.x — what we're polishing now.** The core product (Karpathy's three operations: ingest, query, lint) is shipped and works end-to-end on Mac / Linux / Windows. V1.x is about closing real-world rough edges: cross-platform testing, native-dep edge cases, UI polish on routes that haven't gotten love yet, performance.

**V2 — material expansion.** Tauri desktop installer (removes Node prerequisite, single-binary install for non-technical users). URL-namespaced multi-wiki (`/w/<id>/wiki` so you can browse multiple wikis in tabs). Embeddings-based search (vector + FTS5 hybrid). Live wiki sync via chokidar so Obsidian/vim edits appear in the browser instantly. Ollama support so users can run local models without OpenRouter.

**V3 — different category.** MCP server mode (expose the wiki as memory for Claude Desktop / other agents). Plugin system (user-authored extractors, prompts, lint rules). Possibly a cloud-hosted version for users who don't want to self-host. These are explicitly long-horizon — don't start work on them without proposing the shape first.

The project will **stay** local-first, BYOK, MIT, and TypeScript-only. There's no plan to add telemetry, auth, hosted SaaS-by-default, or to rewrite the core in another language. If your contribution idea conflicts with these, it's probably not a good fit — open a discussion first.

---

## What we need help with right now

Pick something here, or propose your own (open an issue first so we can talk about fit before you write code).

### 🟢 Quick wins (≤ 1 hour, good first PR)

Low scope, mentored, high signal-to-effort. Pick one of these for your first PR.

1. **Cross-platform install QA.** `npm install -g @syasas/llm-wiki` and run `llm-wiki doctor` on a platform we haven't verified — recent Ubuntu LTS, Fedora, Arch, Windows 11, macOS Sequoia on Intel, FreeBSD, anything. Report results (working / breaks how) as a GitHub issue with the `platform` label.

2. **Doc clarifications.** Find something in `docs/` or the README that's unclear, outdated, or assumes too much. Open a PR with the fix. Even a single confusing paragraph is welcome.

3. **In-app screenshots refresh.** When the UI changes (it will), the screenshots under [`docs/screenshots/`](docs/screenshots/) drift. Periodic refresh PRs are useful.

4. **Test coverage for an under-tested module.** Look at `packages/core/src/` — anything without a `.test.ts` neighbor is fair game. `editor.ts`, `index-builder.ts`, `links.ts` are good candidates.

5. **Lint flake.** `packages/core/src/sync.test.ts` has one chokidar live-watch test that fails ~1 in 5 runs (race in the test, not the production code). Hunt down the race condition and stabilize it.

### 🟡 Medium (1–3 hours, mid-experience)

These need a bit more context but each is bounded.

6. **Persistent camera state on `/graph`.** Remember the last camera position when navigating away and returning. Store in URL hash or localStorage; restore on mount. The 3D graph code is in `apps/web/src/components/graph/vault-graph.tsx`.

7. **Local-model UI support (Ollama).** The LLM client already works against any OpenAI-compatible base URL. Add a "Provider" picker in Settings → Models with sensible defaults per provider (OpenRouter / Anthropic direct / OpenAI direct / Ollama at `http://localhost:11434/v1`). Wire it through so each operation slot can pick its provider independently.

8. **Scheduled lint runs.** Cron-style: "Run lint nightly, append result to `log.md`." Either an in-process scheduler (when `llm-wiki start` is running) or a CLI subcommand (`llm-wiki lint --report-to-log`). Discuss approach in an issue first.

9. **Wiki templates beyond the 5 we ship.** [`packages/core/src/templates.ts`](packages/core/src/templates.ts) has Blank / Research / Legal / Clinical / Project / Personal. Want to add Academic Course Notes? Investing? Recipe collection? Fork the file, add an entry, PR it.

10. **2D graph toggle.** `react-force-graph-2d` has a near-identical API to the 3D version we use. Add a toggle in the graph view. Users on weak GPUs or who prefer flat views benefit.

### 🔴 Big (V2-scoped, propose first)

Real architectural work. **Open an issue and discuss the approach before writing code** — these touch enough of the codebase that "surprise PR" is almost guaranteed to need rework.

11. **Tauri desktop installer.** Wrap the Next.js server in a Tauri shell so users get a single-binary native app (no Node prerequisite). Biggest unlock for non-technical users. Needs a thoughtful approach to file-open helpers (browser sandboxes block `file://` so opening a raw source in the user's editor doesn't work today).

12. **Embeddings-based search.** Today FTS5 covers keyword matches. Vector search would handle "find me anything about quantum supremacy even if it's phrased differently." OpenAI / Voyage / local embeddings via Ollama. Storage: a sidecar SQLite table with embeddings, hybrid retrieval.

13. **Live wiki sync via chokidar.** Half-built — the file watcher exists in `packages/core/src/sync.ts`. Wire it to `revalidatePath()` so external edits (Obsidian, vim) show up in the browser without a manual refresh.

14. **`FileSystem` interface extraction (V2 prep for cloud).** Pure refactor with no behavior change. Today `packages/core/src/wiki.ts`, `index-builder.ts`, `editor.ts`, `chat.ts` all call `node:fs/promises` directly. Lift those calls behind a small interface (`readFile`, `writeFile`, `readdir`, `stat`, `mkdir`) so the file-IO layer is swap-able: local FS today, S3/R2 if a cloud version ever happens. Bonus: cleaner test seams.

15. **GitHub Actions CI matrix.** No CI yet. A workflow that runs `pnpm install + pnpm test + pnpm typecheck` on push, plus the install-and-doctor smoke test on `macos-latest / ubuntu-latest / windows-latest`. Cross-platform regressions caught automatically.

### 🐛 Bug reports

If you hit something broken, open a GitHub issue with the **🐛 Bug report** template. Include OS / Node version / `llm-wiki version` output. Bug reports with reproduction steps are themselves a contribution.

### 💡 Ideas + design discussions

For "what if we did X" conversations that don't fit an issue, open a [GitHub Discussion](https://github.com/ddsyasas/llm-wiki/discussions). Lower stakes than an issue, doesn't need a fix attached.

---

## What we don't want

These would be rejected — please don't spend time on them unless you've talked them through first:

- **Telemetry, analytics, error reporting back to us.** Strict no in v1, must be opt-in + clearly disclosed if ever added.
- **A different database than SQLite** for core metadata. Single-file portability is a feature.
- **A rewrite of any core layer in a different language.** TypeScript everywhere is a hard rule.
- **New frameworks.** No Electron, no Vite-as-build-tool, no different UI lib than React/Tailwind/shadcn.
- **Features that require a server we run.** Stays local-first, BYOK.
- **Cosmetic refactors** that don't fix a bug or unlock a feature — code style, mass `const`/`let` swaps, prettier-config bikeshedding.
- **AI-generated PRs** without a human reviewer. If you used an AI to draft something, that's fine, but read every diff and own the result. Drive-by AI PRs that the submitter can't explain get closed.
- **V3 features built speculatively.** MCP, plugins, cloud — these need architectural discussion before code lands.

The full non-goals list is in [`docs/01-vision.md`](docs/01-vision.md) and [`docs/04-features-v1.md`](docs/04-features-v1.md) ("What V1 does NOT include").

---

## How to actually contribute

### One-time setup

Requires Node 20+ and pnpm 8+.

```bash
git clone https://github.com/ddsyasas/llm-wiki.git
cd llm-wiki
pnpm install
pnpm dev          # http://localhost:3000
```

You'll need an [OpenRouter API key](https://openrouter.ai/keys) (~$5 lasts most users 2-4 weeks at default models) to test ingest / query / lint features.

### Before you start coding

1. **Read [`CLAUDE.md`](CLAUDE.md)** at the repo root — the do/don't list the project's design contract is built on.
2. **Find or open an issue** for the work. For anything Medium-or-bigger, propose your approach in the issue before writing code. Avoid "surprise PRs."
3. **Branch from `main`** with a name like `fix/<short-thing>` or `feat/<short-thing>`.

### While coding

- TypeScript strict mode, no `any` without a comment explaining why.
- Functions over classes where possible.
- Named exports for shared modules (no default exports outside Next routes).
- File names: `kebab-case`. React components: `PascalCase`.
- Comments explain *why*, not *what*. Don't comment obvious code.
- Every LLM operation must validate its JSON response via zod before using it.

### Before opening the PR

```bash
pnpm -r exec tsc --noEmit                            # typecheck everything
pnpm --filter @llm-wiki/core test --run              # ~158 core tests
pnpm --filter @llm-wiki/llm test --run               # ~25 llm tests
pnpm --filter @llm-wiki/ingestion test --run         # ~11 ingestion tests
```

All three should pass. (One known chokidar live-watch flake exists — re-run if it's the only failure.)

### Opening the PR

Use the PR template (loads automatically when you "Open Pull Request" on GitHub). Required fields:

- **What** changed (one paragraph)
- **Why** — link the issue you're closing
- **How tested** — automated tests added, manual steps if UI
- **Screenshots** — if any visible UI change
- **Breaking** — flag any backward-incompat change (wiki on-disk format must stay stable within a major version)

PRs that don't follow the template may get pushed back with "please fill in the template" — not personal, just keeps review tractable.

### Getting your PR reviewed

Maintainer (currently just [@ddsyasas](https://github.com/ddsyasas)) reviews when time allows. No SLA — this is a side project. Reasonable patches usually get a first pass within a week. If a PR sits for 2+ weeks without a comment, ping it.

---

## Code of conduct

This project adopts the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Read it. Behaviors that violate it get a warning, then a ban. Report via GitHub Issues or yasas@idersolutions.com.

---

## Security

Found a security issue? **Please don't open a public issue.** Use [GitHub's private vulnerability reporting](https://github.com/ddsyasas/llm-wiki/security/advisories/new) or email yasas@idersolutions.com directly. See [`SECURITY.md`](SECURITY.md) for full policy.

---

## License + attribution

By contributing, you agree your contribution is licensed under the [MIT License](LICENSE), same as the rest of the project. You retain copyright; the license just covers reuse.

LLM Wiki implements a pattern described by [Andrej Karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). The pattern is his, the implementation is independent. The project is not affiliated with Karpathy or Anthropic.

---

## Recognition

Significant contributors get added to a "Contributors" section in the README. Small fixes get a "thank you" in the release notes. Currently the contributor list is just the author — looking forward to someone else's name showing up there.
