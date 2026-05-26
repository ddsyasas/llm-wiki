import Link from "next/link";

import { PageContainer } from "@/components/page-shell";
import { APP_VERSION } from "@/components/footer";

export const dynamic = "force-dynamic";

export default function DevelopersPage() {
  return (
    <PageContainer width="lg">
      <header className="mb-12">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">
          Developers
        </p>
        <h1 className="mt-2 font-display text-display font-semibold tracking-tight">
          Reading, extending, and contributing.
        </h1>
        <p className="mt-5 max-w-2xl text-body font-serif text-muted-foreground">
          Everything you need to understand the code. For the user-facing
          guide see{" "}
          <Link href="/help" className="text-primary underline underline-offset-2">
            Help
          </Link>
          ; for the product story see{" "}
          <Link href="/about" className="text-primary underline underline-offset-2">
            About
          </Link>
          . The single source of truth for design decisions lives in the{" "}
          <a
            href="https://github.com/ddsyasas/llm-wiki/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            /docs folder on GitHub
          </a>
          .
        </p>
      </header>

      <nav className="mb-12 rounded-md border border-border/70 bg-card p-4">
        <p className="mb-2 text-caption uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-ui sm:grid-cols-2">
          {TOC.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-foreground/80 hover:text-primary"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="stack" eyebrow="Stack" title="What's under the hood">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {STACK.map((row) => (
            <div key={row.label} className="flex items-baseline gap-3">
              <dt className="w-32 shrink-0 text-caption uppercase tracking-wider text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-ui">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p>
          Two hard rules from the design contract: <strong>TypeScript
          everywhere</strong> (no Python sidecars) and <strong>cross-platform
          from day one</strong> (Mac, Windows, Linux). No Electron / Tauri /
          React Native in V1 — the app is a Next.js server you run locally.
        </p>
      </Section>

      <Section id="layout" eyebrow="Layout" title="The monorepo">
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-4 text-[12px] leading-relaxed">
{`llm-wiki/
├── apps/web/                  # Next.js app (UI + API routes)
│   ├── src/app/               # routes
│   ├── src/components/        # shared React components
│   └── src/lib/server-wiki.ts # per-request DB + settings context
├── packages/core/             # wiki I/O, schemas, prompts, operations
│   ├── src/wiki.ts            # file I/O for pages, index, log
│   ├── src/db.ts              # SQLite open + schema migrations
│   ├── src/ingest.ts          # the ingest operation
│   ├── src/query.ts           # the query operation
│   ├── src/lint.ts            # the lint operation
│   ├── src/chat.ts            # chat threads (send, create, promote)
│   ├── src/editor.ts          # manual page edits + lint quick-fixes
│   ├── src/index-builder.ts   # index.md render + rebuild
│   ├── src/lint-fixes.ts      # LLM-powered lint fixes
│   ├── src/graph.ts           # /graph builder — nodes/links from pages
│   ├── src/secrets.ts         # OpenRouter key (keychain w/ file fallback)
│   ├── src/schema.ts          # zod schemas for LLM JSON contracts
│   └── src/prompts/           # system prompts per operation
├── packages/llm/              # LLM client + retries + JSON repair
│   ├── src/client.ts          # OpenRouter via openai SDK + defensive parse
│   └── src/models.ts          # model presets + pricing table
├── packages/ingestion/        # source-format extractors
│   ├── src/pdf.ts             # vision-model pipeline
│   ├── src/docx.ts            # mammoth
│   ├── src/html.ts            # Readability + jsdom + turndown
│   └── …                      # one extractor per format
└── docs/                      # spec — read 01-vision.md first`}
        </pre>
      </Section>

      <Section id="ops" eyebrow="The three operations" title="Ingest, Query, Lint">
        <p>
          Karpathy's pattern centers three operations. Each is a single
          function in <code>packages/core/</code> that takes the wiki path,
          a DB connection, an LLM client, and a model slug.
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <OpCard
            name="ingest"
            file="packages/core/src/ingest.ts"
            entry="ingestSource() / ingestPastedText() / ingestVisionSource()"
            what="Reads schema + index + top-K relevant pages, calls the LLM with a strict JSON schema (zod-validated), writes new pages, updates existing ones (with backup), refreshes index, appends log."
          />
          <OpCard
            name="query"
            file="packages/core/src/query.ts"
            entry="answerQuery()"
            what="Reads schema + index + top-K pages, calls the LLM with the question, returns answer + cited slugs + an optional new-page suggestion the user can promote."
          />
          <OpCard
            name="lint"
            file="packages/core/src/lint.ts"
            entry="lintWiki()"
            what="Two passes: local scan (broken links + orphans, no LLM) and LLM pass (contradictions, gaps, stale, missing-page). Returns issues grouped + suggested-fix strings + overall health rating."
          />
        </div>
      </Section>

      <Section
        id="contracts"
        eyebrow="LLM contracts"
        title="JSON shapes the LLM must return"
      >
        <p>
          Every LLM call is non-streaming + returns JSON validated by zod
          before use. Schemas live at{" "}
          <code>packages/core/src/schema.ts</code>:
        </p>
        <ul className="space-y-1">
          <li>
            <code>IngestResponseSchema</code> — newPages, pageUpdates,
            indexEntries, logEntry, contradictions
          </li>
          <li>
            <code>QueryResponseSchema</code> — answer, pagesUsed,
            suggestedNewPage, confidence, caveats
          </li>
          <li>
            <code>LintResponseSchema</code> — issues (severity + type +
            description + affectedPages + suggestedFix), suggestedQuestions,
            overallHealth
          </li>
        </ul>
        <p>
          The LLM client (
          <code>packages/llm/src/client.ts</code>) handles:
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Defensive JSON parsing</strong> — strips markdown code
            fences (Anthropic models love wrapping their JSON in{" "}
            <code>```json</code>) and slices to first-brace through
            last-brace.
          </li>
          <li>
            <strong>One repair retry</strong> on InvalidJsonError, then
            surface to UI.
          </li>
          <li>
            <strong>Retry with backoff</strong> on 5xx / network / 429
            (Retry-After honored).
          </li>
          <li>
            <strong>AbortSignal propagation</strong> for user cancellation
            mid-flight.
          </li>
        </ul>
      </Section>

      <Section
        id="storage"
        eyebrow="Storage"
        title="Files of truth, SQLite for metadata"
      >
        <p>
          The wiki folder is the source of truth. SQLite (
          <code>.llm-wiki/meta.sqlite</code>) is a derived cache —
          regenerable from the markdown on disk via{" "}
          <code>syncWikiToDb()</code> on startup and live file-watch.
        </p>
        <p>SQLite tables:</p>
        <ul className="space-y-1">
          <li>
            <code>sources</code> — every raw input (filename, format, size,
            ingested_at, url, title)
          </li>
          <li>
            <code>pages</code> — wiki pages cached for fast UI lookups
          </li>
          <li>
            <code>pages_fts</code> — FTS5 virtual table on title + content +
            tags for top-K relevance ranking during ingest/query/lint
          </li>
          <li>
            <code>page_sources</code> — many-to-many join. Powers the
            "Sources" section on each wiki page + the "contributed to N
            pages" view on each source detail page
          </li>
          <li>
            <code>chats</code> — chat thread metadata (file is still source
            of truth)
          </li>
          <li>
            <code>usage</code> — per-call token + cost rows for the
            Settings → Costs tab
          </li>
          <li>
            <code>response_cache</code> — hash-keyed LLM response cache
            (placeholder; unused in V1)
          </li>
        </ul>
        <p>
          Wiki files can be edited externally (Obsidian, vim, git pull).{" "}
          <code>chokidar</code> watches the folder and re-syncs SQLite
          rows on changes.
        </p>
      </Section>

      <Section
        id="extend"
        eyebrow="Extending"
        title="Adding a new source format"
      >
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            Write the extractor in <code>packages/ingestion/src/&lt;format&gt;.ts</code>
            . It receives a <code>Buffer</code> and returns{" "}
            <code>{`{ kind: "text" | "vision", title, content, metadata? }`}</code>.
          </li>
          <li>
            Register the format in{" "}
            <code>packages/ingestion/src/detect.ts</code> so file-extension
            detection routes to it.
          </li>
          <li>
            Add a branch in <code>runExtractor()</code> in{" "}
            <code>apps/web/src/app/api/ingest/route.ts</code>.
          </li>
          <li>
            Append the file extension to the{" "}
            <code>ACCEPTED_EXTENSIONS</code> constant in the Sources page
            so the file picker accepts it.
          </li>
        </ol>
        <p>
          Vision-capable formats (PDF, images) go through{" "}
          <code>ingestVisionSource()</code> which sends the bytes as
          base64 in an <code>image_url</code> message part. The text path
          uses <code>ingestSource()</code>.
        </p>
      </Section>

      <Section
        id="swap-llm"
        eyebrow="LLM"
        title="Swapping providers"
      >
        <p>
          OpenRouter is the default because one key gives access to most
          frontier models. To use a different provider:
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Direct Anthropic / OpenAI / etc.</strong> — change{" "}
            <code>baseURL</code> in <code>packages/llm/src/client.ts</code>{" "}
            <code>createClient()</code>. The <code>openai</code> SDK works
            against any OpenAI-compatible endpoint.
          </li>
          <li>
            <strong>Ollama / local model</strong> — first-class supported via
            the <code>provider</code> field on each model slot in{" "}
            <code>WikiSettings.defaultModels</code>. <code>createClient(apiKey, "ollama")</code>
            {" "}routes to <code>http://localhost:11434/v1</code> (or the{" "}
            <code>OLLAMA_BASE_URL</code> env var if set). User-facing setup
            instructions and per-model hardware requirements live at the in-app{" "}
            <Link
              href="/local-models"
              className="text-primary underline underline-offset-2"
            >
              Local models setup guide
            </Link>
            . Beware: many local models struggle with strict JSON output;
            defensive parsing helps but won&apos;t save badly misformed
            responses.
          </li>
          <li>
            <strong>Per-operation override</strong> — every operation
            accepts a <code>modelOverride</code> param. The UI exposes
            this via per-slot dropdowns at Settings → Models.
          </li>
        </ul>
      </Section>

      <Section
        id="contracts-prompts"
        eyebrow="Prompts"
        title="Where the LLM's instructions live"
      >
        <p>
          One file per operation in <code>packages/core/src/prompts/</code>:
        </p>
        <ul className="space-y-1">
          <li>
            <code>ingest.ts</code> — strict JSON shape, per-field rules,
            wikilink conventions
          </li>
          <li>
            <code>query.ts</code> — citation rules + "save as wiki page"
            suggestion criteria
          </li>
          <li>
            <code>chat.ts</code> — conversational tone, citation rules,
            preserve thread continuity
          </li>
          <li>
            <code>lint.ts</code> — what to flag, what to ignore, how to
            phrase suggested fixes
          </li>
        </ul>
        <p>
          Each prompt embeds a literal <code>JSON_SHAPE</code> block
          showing the expected output object, with field-by-field rules.
          That was added after small models repeatedly drifted on field
          types (e.g. putting the user's topic into a category enum).
        </p>
      </Section>

      <Section
        id="quickfixes"
        eyebrow="Lint fixes"
        title="How quick-fixes are dispatched"
      >
        <p>
          All lint fixes go through a single endpoint:{" "}
          <code>POST /api/lint/fix</code> with a <code>type</code>{" "}
          discriminator:
        </p>
        <ul className="space-y-1">
          <li>
            <code>remove-broken-link</code> — local; strips{" "}
            <code>[[slug]]</code> from a host page via{" "}
            <code>removeBrokenLink()</code> in <code>editor.ts</code>
          </li>
          <li>
            <code>rebuild-index</code> — local; calls{" "}
            <code>rebuildIndexFromPages()</code> in{" "}
            <code>index-builder.ts</code>
          </li>
          <li>
            <code>fix-all-broken-links</code> — local; iterates{" "}
            <code>removeBrokenLink</code> over an array
          </li>
          <li>
            <code>create-stub-page</code> — LLM; gathers backlinks for
            context, calls <code>createStubPage()</code> in{" "}
            <code>lint-fixes.ts</code>. Falls back to{" "}
            <code>rebuild-index</code> when the slug already has a page.
          </li>
          <li>
            <code>apply-suggested-fix</code> — LLM; calls{" "}
            <code>applyLintSuggestedFix()</code>. The client picks the
            target page by scanning the suggested-fix text for kebab-case
            slugs in <code>affectedPages</code> (not always
            <code>affectedPages[0]</code>). No-op detection: if the LLM
            returns unchanged content, skip the write and tell the UI.
          </li>
        </ul>
      </Section>

      <Section
        id="graph"
        eyebrow="Visualization"
        title="3D graph view (/graph)"
      >
        <p>
          Renders the wiki as a 3D force-directed graph. Each page is a node;
          each <code>[[wikilink]]</code> is an edge. Built on{" "}
          <code>react-force-graph-3d</code> (Three.js + d3-force-3d under the
          hood — same engine as Obsidian's 3D Graph plugin).
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Builder</strong> —{" "}
            <code>packages/core/src/graph.ts</code> <code>buildGraph(wikiPath, db)</code>.
            Reuses the existing <code>uniqueLinkedSlugs()</code> parser; drops
            broken links (lint's job to surface) and self-links.
          </li>
          <li>
            <strong>Page</strong> —{" "}
            <code>apps/web/src/app/graph/page.tsx</code> server component.
            Reads <code>?node=&lt;slug&gt;</code> from <code>searchParams</code>
            so deep links work without a client-side flicker.
          </li>
          <li>
            <strong>Client component</strong> —{" "}
            <code>apps/web/src/components/graph/vault-graph.tsx</code>. Dynamic
            import with <code>ssr: false</code> so the ~600KB three.js bundle
            doesn't land in any other route's payload. Theme reactivity via{" "}
            <code>MutationObserver</code> on <code>&lt;html&gt;</code> watching
            the theme class flip.
          </li>
          <li>
            <strong>URL state</strong> via{" "}
            <code>window.history.replaceState</code> (not{" "}
            <code>useRouter().replace()</code>) so selection clicks don't
            trigger Next router re-renders.
          </li>
        </ul>
        <p>
          Design + decisions in{" "}
          <a
            href="https://github.com/ddsyasas/llm-wiki/blob/main/docs/12-graph-view.md"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            docs/12-graph-view.md
          </a>
          .
        </p>
      </Section>

      <Section
        id="testing"
        eyebrow="Testing"
        title="Where the test suite lives"
      >
        <ul className="space-y-1">
          <li>
            <code>packages/core/</code> — <strong>~120+ vitest tests</strong>{" "}
            covering wiki I/O, DB CRUD, sync, ingest, query, lint, chat,
            editor, index-builder, links, config, secrets.
          </li>
          <li>
            <code>packages/llm/</code> — <strong>17 tests</strong> on the
            LLM client (happy path, error mapping, retry behavior,
            defensive JSON parsing).
          </li>
          <li>
            <code>packages/ingestion/</code> — extractor smoke tests per
            format.
          </li>
        </ul>
        <p>Run from the repo root:</p>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-3 text-[12px]">
{`pnpm -r --filter @llm-wiki/core test --run
pnpm -r exec tsc --noEmit            # monorepo typecheck`}
        </pre>
      </Section>

      <Section
        id="distribution"
        eyebrow="Shipping it"
        title="Build + publish pipeline"
      >
        <p>
          Two artifacts come out of the build, with very different shapes:
        </p>
        <ul className="space-y-2">
          <li>
            <strong>Standalone server bundle</strong> (<code>.next/standalone/</code>)
            — what <code>llm-wiki start</code> actually runs. <code>next build</code>
            traces every module the server needs and copies them into a
            self-contained tree alongside <code>server.js</code>. A postbuild
            script (<code>scripts/copy-standalone-assets.mjs</code>) does the
            things Next 14 leaves for you: copies <code>.next/static</code> +{" "}
            <code>public</code> into the standalone tree, and resolves +
            deep-copies every <code>serverComponentsExternalPackages</code>{" "}
            entry from the right workspace root (Next's tracer skips
            externals in pnpm + transpilePackages setups).
          </li>
          <li>
            <strong>Publishable tarball</strong> (<code>dist-publish/</code>)
            — what gets uploaded to GitHub Releases / npm.
            {" "}<code>scripts/build-publish-tarball.mjs</code> assembles a
            clean package: rewrites <code>package.json</code> with the
            public name (<code>@syasas/llm-wiki</code>), strips workspace
            deps + build-time deps, and externalizes the native packages
            (<code>better-sqlite3</code>, <code>keytar</code>, plus heavy
            pure-JS like <code>jsdom</code>) so <code>npm install</code>
            fetches per-platform binaries at install time. Flattens the
            standalone <code>.pnpm/</code> store so Node's regular
            resolver can find everything without pnpm's symlink graph.
          </li>
        </ul>
        <p>Two pnpm scripts in <code>apps/web</code>:</p>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-3 text-[12px]">
{`pnpm build:publish    # build + assemble dist-publish/
pnpm pack:publish     # build:publish + npm pack (smoke test)`}
        </pre>
        <p>
          To actually publish: <code>cd apps/web/dist-publish && npm publish --access public</code>
          {" "}— this is intentionally a manual step (irreversible upload).
        </p>
      </Section>

      <Section
        id="contributing"
        eyebrow="Contributing"
        title="Open questions + pointers"
      >
        <p>
          The project is MIT-licensed and welcomes PRs. Before opening
          one:
        </p>
        <ul className="space-y-1">
          <li>
            Read <code>CLAUDE.md</code> at the repo root for the do/don't
            list.
          </li>
          <li>
            Read <code>docs/01-vision.md</code> through{" "}
            <code>docs/11-attribution-license.md</code> for the design
            contract — V1 scope is deliberately small.
          </li>
          <li>
            See <code>docs/dev-log.md</code> for execution history and
            open questions (V2 ideas, deferred polish, etc.).
          </li>
          <li>
            See <code>docs/dev-setup.md</code> for the run/stop/recover
            recipe and "why is port 3000 stuck" troubleshooting.
          </li>
        </ul>
        <p className="text-caption text-muted-foreground">
          v{APP_VERSION} · MIT ·{" "}
          <a
            href="https://github.com/ddsyasas/llm-wiki"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            github.com/ddsyasas/llm-wiki
          </a>
        </p>
      </Section>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/about"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          ← About
        </Link>
        <Link
          href="/help"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          ← Help
        </Link>
      </div>
    </PageContainer>
  );
}

// ---- pieces -------------------------------------------------------------

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-1 mb-4 font-display text-h2 font-semibold tracking-tight">
        {title}
      </h2>
      <div className="space-y-3 text-body font-serif leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

function OpCard({
  name,
  file,
  entry,
  what,
}: {
  name: string;
  file: string;
  entry: string;
  what: string;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card p-4">
      <p className="font-display text-h3 font-medium tracking-tight text-primary">
        {name}
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
        {file}
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
        → {entry}
      </p>
      <p className="mt-2 text-ui text-muted-foreground">{what}</p>
    </div>
  );
}

const TOC: Array<{ id: string; label: string }> = [
  { id: "stack", label: "Stack" },
  { id: "layout", label: "Monorepo layout" },
  { id: "ops", label: "The three operations" },
  { id: "contracts", label: "LLM JSON contracts" },
  { id: "storage", label: "Storage — files + SQLite" },
  { id: "extend", label: "Adding a new source format" },
  { id: "swap-llm", label: "Swapping LLM providers" },
  { id: "contracts-prompts", label: "Where the prompts live" },
  { id: "quickfixes", label: "Lint quick-fix dispatch" },
  { id: "graph", label: "3D graph view" },
  { id: "testing", label: "Test suite" },
  { id: "distribution", label: "Build + publish pipeline" },
  { id: "contributing", label: "Contributing" },
];

const STACK: Array<{ label: string; value: string }> = [
  { label: "Language", value: "TypeScript strict" },
  { label: "Framework", value: "Next.js 14 (App Router)" },
  { label: "UI", value: "React, Tailwind, shadcn-style primitives" },
  { label: "Storage", value: "Plain markdown + SQLite (better-sqlite3)" },
  { label: "Search", value: "FTS5 (built into SQLite)" },
  { label: "LLM SDK", value: "openai npm package against OpenRouter base URL" },
  { label: "Schema validation", value: "zod" },
  { label: "Frontmatter", value: "gray-matter" },
  { label: "Watch", value: "chokidar" },
  { label: "Tests", value: "vitest" },
  { label: "Package manager", value: "pnpm workspaces" },
  { label: "Node", value: "≥ 18.17" },
];
