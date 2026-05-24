# 02 Architecture

## Stack summary

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript (strict) | One language across the whole stack |
| Framework | Next.js 14+ (App Router) | UI + API routes in one process |
| Styling | Tailwind CSS | Fast, conventional, no surprises |
| Components | shadcn/ui | High-quality primitives, copy-paste so no lock-in |
| Runtime | Node.js 20+ | LTS, broad library support |
| Package mgmt | pnpm | Fast, disk-efficient, good workspace support |
| Local DB | better-sqlite3 | Synchronous, fast, no separate process |
| LLM client | openai SDK | Pointed at OpenRouter, works with all models |
| File parsing | mammoth (docx), officeparser (pptx/xlsx), trafilatura-like for HTML | Solid Node libraries |
| PDFs and images | Send directly to LLM | Vision models handle these natively |
| Testing | Vitest | Fast, Jest-compatible API |

## Why not these alternatives

- **NestJS**: Overkill for a personal tool. Too much ceremony.
- **Express/Fastify standalone**: Next.js API routes are simpler when we already need Next.js for the UI.
- **Python backend**: One language is cleaner. With LLM doing PDF parsing, we don't need Python's parsing ecosystem.
- **Electron**: Heavier than Tauri, which is what V2 will use.
- **Drizzle/Prisma**: Overkill for the simple metadata we store. `better-sqlite3` with raw SQL is plenty.

## Distribution

V1.0 shipped 2026-05-24 (tag `v1.0.0`). The CLI exists in-tree at `apps/web/bin/llm-wiki.mjs` and is functional, but **npm publish is still open work** — `pnpm pack` against workspace:* deps doesn't produce a clean tarball without bundling. Tracked in [`docs/14-roadmap.md`](14-roadmap.md). Until that lands, users install from source:

```bash
git clone https://github.com/ddsyasas/llm-wiki.git
cd llm-wiki && pnpm install
pnpm --filter @llm-wiki/web dev
```

Once published, the original plan stands: `npm install -g @syasas/llm-wiki` then `llm-wiki start [folder]`.

The CLI does three things:
1. Initialize the folder if needed (create `raw/`, `wiki/`, `chats/`, `CLAUDE.md`, etc.)
2. Start a Next.js server bound to localhost on a chosen port (default 3737)
3. Open the user's browser to that port

V2 will wrap the same Next.js app with Tauri to ship a native installer. The web app code does not need to change.

## Repo structure

```
llm-wiki/
├── README.md
├── LICENSE
├── CLAUDE.md
├── CONTRIBUTING.md
├── package.json              # workspace root
├── pnpm-workspace.yaml
├── tsconfig.json
├── docs/                     # design docs (this folder)
├── apps/
│   └── web/                  # the Next.js app, the actual product
│       ├── package.json
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       ├── bin/
│       │   └── llm-wiki.mjs  # CLI entry point
│       ├── src/
│       │   ├── app/          # Next.js routes
│       │   │   ├── (ui)/     # UI routes
│       │   │   └── api/      # API endpoints
│       │   ├── components/   # React components
│       │   ├── lib/          # shared utilities
│       │   └── styles/
│       └── public/
└── packages/
    ├── core/                 # ingest/query/lint logic, no UI
    │   ├── package.json
    │   └── src/
    │       ├── ingest.ts
    │       ├── query.ts
    │       ├── lint.ts
    │       ├── wiki.ts       # file I/O for the wiki
    │       ├── schema.ts     # zod schemas for LLM JSON
    │       └── index.ts
    ├── ingestion/            # source format parsers
    │   ├── package.json
    │   └── src/
    │       ├── docx.ts
    │       ├── pptx.ts
    │       ├── xlsx.ts
    │       ├── html.ts
    │       ├── markdown.ts
    │       ├── plain.ts
    │       ├── url.ts        # fetches + cleans HTML
    │       ├── pdf.ts        # passes through to LLM
    │       ├── image.ts      # passes through to LLM
    │       ├── detect.ts     # format detection
    │       └── index.ts
    └── llm/                  # OpenRouter client wrapper
        ├── package.json
        └── src/
            ├── client.ts
            ├── models.ts     # model presets (cheap, smart, vision)
            └── index.ts
```

## Why a monorepo

The three packages (`core`, `ingestion`, `llm`) have clear responsibilities and can be tested independently. The `apps/web/` directory imports from them. In V2, `apps/desktop/` will also import from them without duplication.

## Process model

V1 is a single Node process. Next.js handles:
- Serving the UI (React)
- API routes for ingest/query/lint/etc.
- Reading and writing markdown files to the user's chosen folder
- Reading and writing SQLite for metadata

No separate worker process in V1. Long-running operations (ingestion of a big PDF) stream progress to the client via Server-Sent Events.

## Configuration

The user's API key and settings live in a config file at `~/.llm-wiki/config.json`. Never inside the wiki folder itself (the wiki folder should be safe to commit to git, so no secrets there).

Per-wiki settings (default model, lint frequency) live in a `.llm-wiki/settings.json` file inside the wiki folder. This IS safe to commit.

## Cross-platform considerations

- Use `path.join` everywhere, never string concatenation for paths
- Use `os.homedir()` for config location
- Test on Mac and Linux at minimum
- Avoid shell-outs that differ between OSes (no `cp -r`, use Node APIs)
- Newlines: write `\n`, but tolerate `\r\n` when reading

## Performance targets

- Ingest a typical article (5K words) in under 30 seconds
- Query response starts streaming in under 3 seconds
- Lint a 50-page wiki in under 60 seconds
- UI interaction (page switch, search) under 100ms
- Cold start of `llm-wiki start` under 5 seconds

These are V1 targets. We optimize later if needed.
