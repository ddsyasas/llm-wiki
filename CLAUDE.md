# Project Brief for Claude Code

You are building **LLM Wiki**, an open source local-first knowledge base inspired by Andrej Karpathy's LLM Wiki pattern (gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## Read this first

Before writing any code, read every file in `/docs/` in numerical order. Each file is short and focused. Together they form the complete spec.

1. `docs/01-vision.md` - What this is and who it's for
2. `docs/02-architecture.md` - Stack, repo layout, distribution
3. `docs/03-data-model.md` - On-disk structure and SQLite schema
4. `docs/04-features-v1.md` - Exact V1 feature scope
5. `docs/05-llm-integration.md` - OpenRouter, prompts, JSON contracts
6. `docs/06-ingest-pipeline.md` - How sources become wiki pages
7. `docs/07-chat-threads.md` - Chat feature spec
8. `docs/08-ui-design.md` - Design language and key screens
9. `docs/09-cli-distribution.md` - CLI behavior and npm packaging
10. `docs/10-build-order.md` - Sequenced build plan, follow this exactly
11. `docs/11-attribution-license.md` - Naming, credits, license

## Core principles, do not violate

1. **Everything is a file**. The wiki, chats, schema, log all live as plain `.md` files in the user's chosen folder. SQLite is metadata only.
2. **Local-first, BYOK**. No telemetry, no remote storage, no auth. Users bring their own OpenRouter key.
3. **One language**: TypeScript everywhere. No Python sidecars in V1.
4. **Cross-platform**: Mac, Windows, Linux all supported from day one.
5. **Karpathy's three operations** are central: ingest, query, lint. Build them as separate, well-named modules.

## Stack lock-in

- Next.js (App Router) for the whole app
- Tailwind + shadcn/ui for UI
- `better-sqlite3` for metadata
- `openai` SDK pointed at OpenRouter
- pnpm for package management
- TypeScript strict mode

Do not introduce new frameworks without asking.

## Working conventions

- TypeScript strict mode, no `any` without comment explaining why
- Functions over classes where possible
- File names: kebab-case
- React components: PascalCase
- No default exports for shared modules, named exports only
- Comments explain *why*, not *what*
- Every LLM operation must validate its JSON response before using it

## Don't do these things

- Don't add localStorage or sessionStorage anywhere (server-side app, doesn't apply)
- Don't introduce React Native, Electron, or Tauri yet (that's V2)
- Don't add a database other than SQLite
- Don't add telemetry, analytics, or external tracking
- Don't put the user's API key in a file that could be committed (use OS keychain or a gitignored env)
- Don't write large monolithic files; split by responsibility

## When in doubt

Refer back to the docs. If a question isn't answered there, ask the user before guessing.

## Attribution

This project is by Yasas. It implements a pattern by Andrej Karpathy. See `docs/11-attribution-license.md` for where credits go.
