# Dev Setup — Running LLM Wiki Locally

Quick reference for getting the app running on your machine and recovering when things get stuck. Update this as the workflow evolves.

---

## Prerequisites

- **Node** ≥ 18.17 (Next 14 requires it; check with `node --version`)
- **pnpm** ≥ 8 (the lockfile is pnpm — npm/yarn will not work). Install with `npm install -g pnpm` if you don't have it.
- macOS or Linux primary. Windows works but native deps (`better-sqlite3`, `keytar`) sometimes need extra setup.

---

## One-time setup

From the repo root:

```bash
pnpm install
```

That installs every workspace (apps/web, packages/core, packages/llm, packages/ingestion). First install takes a minute because of the native modules.

Optionally, point the dev server at a wiki folder of your choice (otherwise it uses `~/llm-wiki-default`):

```bash
export LLM_WIKI_PATH=~/path/to/your-wiki-folder
```

---

## Run the dev server

From the repo root:

```bash
pnpm --filter @llm-wiki/web dev
```

You should see:

```
- Local:        http://localhost:3000
✓ Ready in 1.5s
```

Open `http://localhost:3000`. First page load takes 10–30 seconds while Next compiles routes lazily — watch the terminal for `✓ Compiled / in XXXms`, then the page renders.

**If you see `⚠ Port 3000 is in use, trying 3001 instead`** — a previous dev server didn't clean up. See [Recover from stuck ports](#recover-from-stuck-ports) below.

---

## Stop the dev server

In the terminal running it: `Ctrl+C`. Next flushes, closes the port, runs shutdown hooks. Clean exit.

**Trap:** if you close the terminal window instead of `Ctrl+C`-ing, the parent shell dies but the child `next-server` process can keep holding the port. The next `pnpm dev` will spawn on 3001, 3002, etc. — and your browser bookmarked at `localhost:3000` will still hit the stale orphan.

---

## Recover from stuck ports

You'll know you have this problem when:

- `pnpm dev` jumps to port 3001+ instead of 3000
- Your browser at `localhost:3000` loads stale code (changes don't show up)
- Or the browser hangs at `localhost:3000` with no response

**Diagnose** — what's on the relevant ports:

```bash
lsof -i:3000,3001,3002,3003,3004
```

Each row prints the PID and the process name. `next-server` PIDs are the orphans.

**Kill everything with prejudice** (`-9` skips graceful shutdown — use this when soft `pkill` fails):

```bash
pkill -9 -f next-server
pkill -9 -f "next dev"
pkill -9 -f "pnpm.*@llm-wiki"
```

**Verify it's clean:**

```bash
lsof -i:3000,3001,3002,3003,3004
```

Should print nothing. If a PID is still there, kill it directly: `kill -9 <PID>`.

**Restart one clean dev server:**

```bash
pnpm --filter @llm-wiki/web dev
```

You should land on port 3000 with no "Port X is in use" warnings.

> **Note on zsh comments:** in interactive zsh, `#` is NOT a comment by default. Pasting `lsof -i:3000  # check ports` will fail with `status error on check: No such file or directory`. Strip comments before pasting commands, or `setopt interactive_comments` in your `~/.zshrc`.

---

## Other useful commands

| What | Command |
|---|---|
| Run all core tests | `pnpm --filter @llm-wiki/core test --run` |
| Run all llm tests | `pnpm --filter @llm-wiki/llm test --run` |
| Typecheck the monorepo | `pnpm -r exec tsc --noEmit` |
| Build for production | `pnpm --filter @llm-wiki/web build` |
| Clear Next's build cache | `rm -rf apps/web/.next` |

**Cache trick:** if hot-reload stops picking up changes (especially server components or API routes), `Ctrl+C` the dev server, `rm -rf apps/web/.next`, then restart. Solves 90% of "my edit didn't take" weirdness.

---

## Wiki folder defaults

The dev server reads/writes a wiki folder per `LLM_WIKI_PATH`. Defaults to `~/llm-wiki-default`.

- The folder gets created on first server boot.
- Layout: `wiki/*.md`, `chats/*/*.md`, `raw/*`, `CLAUDE.md`, `index.md`, `log.md`, `.llm-wiki/meta.sqlite`.
- Wipe a wiki to start over: `rm -rf ~/llm-wiki-default` (the folder is reproducible — the LLM rebuilds it from raw sources).
- Keep multiple wikis: easiest is via the app — **Settings → Wikis** (or the active-wiki chip in the header) to create / switch / remove. The chosen wiki persists in `~/.llm-wiki/config.json` `activeWiki` and survives restarts. The env var override (`export LLM_WIKI_PATH=~/another-wiki-folder` before `pnpm dev`) still wins if set, which is useful for scripting, CI, or running two dev servers on different ports for true side-by-side browsing. See [`docs/13-multi-wiki.md`](13-multi-wiki.md) for the full picture.

---

## When something genuinely breaks

1. Try the cache-clear: `Ctrl+C`, `rm -rf apps/web/.next`, restart.
2. Try the dep-rebuild: `rm -rf node_modules apps/web/node_modules packages/*/node_modules && pnpm install`.
3. Check `docs/dev-log.md` for context on recent changes and known issues.
4. Open an issue at https://github.com/ddsyasas/llm-wiki/issues.
