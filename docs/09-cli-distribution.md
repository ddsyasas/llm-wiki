# 09 CLI and Distribution

## Package identity

- **npm package name**: `@yasas/llm-wiki`
- **Binary name**: `llm-wiki`
- **Repository**: `github.com/ddsyasas/llm-wiki`

## Install paths users will follow

### Global install (recommended)

```bash
npm install -g @yasas/llm-wiki
# or
pnpm add -g @yasas/llm-wiki
```

Then anywhere:

```bash
llm-wiki start              # uses current directory
llm-wiki start ~/research   # specify wiki folder
```

### Try without install

```bash
npx @yasas/llm-wiki@latest start ~/research
```

### From source (contributors)

```bash
git clone https://github.com/ddsyasas/llm-wiki
cd llm-wiki
pnpm install
pnpm dev
```

## CLI commands

```
llm-wiki <command> [options]

Commands:
  start [folder]          Start the wiki server (default command)
  init [folder]           Initialize a folder as a wiki without starting
  config                  Open the global config file
  config set <key> <val>  Set a config value
  doctor                  Check installation and connectivity
  version                 Print version
  help                    Show help

Options:
  --port <port>           Port to bind (default: 3737, or LLM_WIKI_PORT env)
  --no-open               Don't open browser automatically
  --quiet                 Suppress non-error logs
  --debug                 Verbose logs

Examples:
  llm-wiki start
  llm-wiki start ~/research/quantum --port 4000
  llm-wiki config set openrouterKey sk-or-...
  llm-wiki doctor
```

## `llm-wiki start` flow

1. Resolve folder path (argument or `cwd`)
2. Check if folder is initialized:
   - Looks for `.llm-wiki/` directory
   - If missing: run init flow (creates folders, default CLAUDE.md, etc.)
3. Check global config:
   - If no OpenRouter key: print message with link to OpenRouter and instructions, but still start server (user can add key in UI)
4. Find available port (default 3737, or fallback to next available)
5. Spawn Next.js production server
6. Wait for "ready" signal (or 5-second timeout)
7. Print URL to console
8. Open browser to URL (unless `--no-open`)
9. Stay attached. Ctrl+C cleanly shuts down.

## First-run init

When `llm-wiki start` runs in a folder without `.llm-wiki/`:

```
$ llm-wiki start ~/research/quantum

This folder isn't initialized as a wiki yet.
I'll create the following structure:

  ~/research/quantum/
  ├── CLAUDE.md         (your wiki schema)
  ├── index.md          (auto-maintained)
  ├── log.md            (event log)
  ├── raw/              (source files)
  ├── wiki/             (pages)
  ├── chats/inbox/      (conversations)
  └── .llm-wiki/        (app data, gitignored)

Continue? [Y/n] 
```

On confirmation, create all of the above, including a default `CLAUDE.md` template and a starter `.gitignore`.

## `llm-wiki doctor`

Diagnostic command for support:

```
$ llm-wiki doctor

Checking installation...
  ✓ Node version: 20.11.0 (required: ≥20.0.0)
  ✓ Platform: darwin arm64
  ✓ Global install path: /Users/yasas/.nvm/versions/node/v20/lib/node_modules
  
Checking config...
  ✓ Config file exists: ~/.llm-wiki/config.json
  ✓ OpenRouter API key set (sk-or-v1-***...***abc)
  
Checking OpenRouter connectivity...
  ✓ Reachable
  ✓ API key valid
  ✓ Models available: 47

Checking recent wikis...
  ✓ /Users/yasas/research/quantum (last opened 2 days ago)
  
All checks passed. ✓
```

## Cross-platform considerations

### Path handling

```typescript
// Always use these
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";

// Never do this
const path = `${dir}/${file}`;  // ❌ breaks on Windows
```

### Config file location

```typescript
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".llm-wiki");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
```

Same on all platforms (use the home directory, not platform-specific app data dirs in V1).

### Opening the browser

```typescript
import open from "open";  // npm package
await open(`http://localhost:${port}`);
```

The `open` package handles all three OSes correctly.

### Process management

Use `child_process.spawn` with `detached: false` (default) so child processes die when the CLI dies. Listen for `SIGINT` and `SIGTERM` to clean up:

```typescript
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await cleanup();
  process.exit(0);
});
```

## CLI entry point

In `apps/web/bin/llm-wiki.mjs`:

```javascript
#!/usr/bin/env node
// Thin wrapper; real logic lives in src/cli/

import { runCli } from "../dist/cli/index.js";

runCli(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

`package.json` `bin` field:

```json
{
  "bin": {
    "llm-wiki": "./bin/llm-wiki.mjs"
  }
}
```

## Build and publish

### Build

```bash
pnpm build
```

Runs:
1. `tsc --build` for all workspace packages
2. `next build` for the web app
3. Outputs to `apps/web/.next/standalone` (Next.js standalone mode)
4. Copies static assets

### Standalone mode

Use Next.js standalone output mode so the published package is self-contained:

```javascript
// next.config.mjs
export default {
  output: "standalone",
};
```

This bundles only the actually-used dependencies into `.next/standalone`, dramatically shrinking the published size.

### Publish

```bash
pnpm publish --access public
```

`package.json` files field:

```json
{
  "files": [
    "bin",
    ".next/standalone",
    ".next/static",
    "public",
    "dist"
  ]
}
```

## Versioning

Semver. V1 starts at `0.1.0` (not 1.0.0; we want room to break things while users are early adopters).

- Patch (0.1.x): bug fixes, no API or schema changes
- Minor (0.x.0): new features, backward-compatible
- Major (x.0.0): wiki folder format changes, schema migrations needed

We publish 1.0.0 only when the wiki format is frozen and we're committing to backward compatibility for a year.

## Telemetry policy

**None in V1.** No analytics, no error reporting back to us, no version-check pings. The user is in control.

If we add anything later, it must be:
- Opt-in (default off)
- Disclosed clearly in privacy doc
- Anonymized (no API keys, no wiki content, no filenames)
- Verifiable by reading the code

## Documentation pages to ship in the repo

In `docs/`:
- `INSTALL.md`: full install instructions for all platforms
- `OPENROUTER_SETUP.md`: how to sign up, get a key, fund credits, paste in app
- `MODELS.md`: which models work, cost comparison, recommended presets
- `TROUBLESHOOTING.md`: common issues and fixes
- `CONTRIBUTING.md`: how to contribute (in repo root, not docs/)

These are for end users. The architecture docs in this folder are for development.

## OpenRouter setup doc (for users)

Sketch of what `docs/OPENROUTER_SETUP.md` should cover:

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up (Google, GitHub, or email)
3. Click your avatar → Credits → add at least $5 (this lasts most users 2-4 weeks)
4. Click your avatar → Keys → Create Key
5. Copy the key (starts with `sk-or-v1-`)
6. Paste it into LLM Wiki Settings → API → OpenRouter Key

Include screenshots. Mention cost expectations ($5 ingests maybe 100-200 articles at default models).
