import Link from "next/link";

import { PageContainer } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <PageContainer width="lg">
      <header className="mb-12">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">
          Help
        </p>
        <h1 className="mt-2 font-display text-display font-semibold tracking-tight">
          How to use LLM Wiki.
        </h1>
        <p className="mt-5 max-w-2xl text-body font-serif text-muted-foreground">
          Everything you can do in the app, in the order you'd typically do it.
          For the why-it-exists story see{" "}
          <Link href="/about" className="text-primary underline underline-offset-2">
            About
          </Link>
          ; for how it's built see{" "}
          <Link href="/developers" className="text-primary underline underline-offset-2">
            Developers
          </Link>
          .
        </p>
      </header>

      {/* Table of contents — long page, helps scanning. */}
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

      <Section id="overview" eyebrow="Mental model" title="The three layers">
        <p>
          Three layers live in the wiki folder you chose:
        </p>
        <ul className="space-y-2">
          <Layer
            name="raw/"
            what="Your sources, untouched. Whatever you pasted or uploaded, byte-for-byte. Never deleted by the app."
          />
          <Layer
            name="wiki/"
            what="The LLM-maintained pages. Cross-linked, short, structured. Lossy by design — they summarize raw/."
          />
          <Layer
            name="CLAUDE.md"
            what="The schema. A few paragraphs of plain English telling the LLM what this wiki is about and how to organize it. The LLM reads it on every operation."
          />
        </ul>
        <p className="mt-4">
          And three operations the LLM performs against those layers:
        </p>
        <ul className="space-y-2">
          <Op
            name="Ingest"
            what="Read a new source → write/update wiki pages, refresh the index, log the change."
          />
          <Op
            name="Query"
            what="Read your question + the wiki → produce a cited answer."
          />
          <Op
            name="Lint"
            what="Read the whole wiki → flag contradictions, broken links, orphans, missing pages, stale claims."
          />
        </ul>
      </Section>

      <Section
        id="setup"
        eyebrow="First-run"
        title="Setting up: topic + API key"
      >
        <p>
          When you open the app for the first time you'll see a setup card
          asking for two things:
        </p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            <strong>Wiki topic.</strong> One line describing what this wiki is
            about (e.g. <em>"Quantum computing research and the algorithms
            underlying it"</em>). The LLM reads this on every operation, so
            specific is better than generic.
          </li>
          <li>
            <strong>OpenRouter API key.</strong> Get one at{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              openrouter.ai/keys
            </a>{" "}
            — pay-as-you-go, one key gives access to Claude, GPT, Gemini,
            Llama, more. We never see it; it goes into your OS keychain when
            possible, otherwise a chmod-600 file in <code>~/.llm-wiki/</code>.
          </li>
        </ol>
        <p>
          You can change either later in <Link href="/settings" className="text-primary underline underline-offset-2">Settings</Link>.
        </p>
      </Section>

      <Section
        id="sources"
        eyebrow="Adding to the wiki"
        title="Sources — getting content in"
      >
        <p>
          Go to{" "}
          <Link href="/sources" className="text-primary underline underline-offset-2">
            Sources
          </Link>{" "}
          and pick a mode at the top:
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Paste</strong> — drop text or markdown in the textarea.
            Fastest for "I just want to add this article."
          </li>
          <li>
            <strong>File</strong> — drag a file in or click to choose. Supported:{" "}
            <code>.md / .txt / .html / .pdf / .docx / .pptx / .xlsx / .png /
            .jpg / .webp</code>. PDFs and images go through a vision model;
            everything else is text-extracted locally.
          </li>
          <li>
            <strong>URL</strong> — fetches the page, runs Mozilla's Readability
            to strip nav/ads/sidebars, ingests the clean article.
          </li>
        </ul>
        <p>
          The page shows a <strong>cost preview</strong> before you ingest so
          there are no surprises. Click <strong>Ingest</strong>; ~10–30s
          later you'll see a summary of new pages, updated pages, and any
          contradictions the LLM flagged.
        </p>
        <p>
          Above the form, <strong>Ingested sources</strong> lists everything
          you've added with format, size, date, and how many wiki pages it
          contributed to. Click any row to see the original + full lineage.
        </p>
      </Section>

      <Section
        id="wiki"
        eyebrow="Reading"
        title="The wiki — browsing your pages"
      >
        <p>
          <Link href="/wiki" className="text-primary underline underline-offset-2">
            /wiki
          </Link>{" "}
          shows your pages as cards grouped by type (Overviews → Concepts →
          Entities → Comparisons → Sources). Each card shows the title, a
          short summary, tags, and when it was last touched.
        </p>
        <p>Click any card and you'll see:</p>
        <ul className="space-y-1">
          <li>The page body, rendered as readable prose.</li>
          <li>
            <strong>Sources</strong> at the bottom — chips linking to the
            raw inputs the LLM compiled this page from.
          </li>
          <li>
            <strong>Backlinks</strong> — every other wiki page that mentions
            this one. The graph view in list form.
          </li>
          <li>
            An <strong>Edit</strong> button in the header. Editing is a real
            split-pane markdown editor; saves back up the prior version to{" "}
            <code>.llm-wiki/page-history/</code>.
          </li>
        </ul>
        <p>
          The sidebar has a filter input — type to narrow the page list. Or
          press <kbd className="rounded border border-border bg-muted/50 px-1 font-sans text-[11px]">⌘K</kbd>{" "}
          anywhere to fuzzy-find by title.
        </p>
      </Section>

      <Section
        id="query"
        eyebrow="Asking questions"
        title="Query vs Chats — when to use which"
      >
        <p>
          Two ways to ask the wiki things:
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SubCard title="Query — one-shot Q&A">
            For "ask once and move on." Each question is independent; no
            memory between them. Answer comes with cited pages and an
            optional <strong>Save as wiki page</strong> button if it's
            promotion-worthy.
          </SubCard>
          <SubCard title="Chats — multi-turn threads">
            For ongoing investigations. Each chat is a real markdown file in{" "}
            <code>chats/</code>. Pin, rename, move between folders. Every
            assistant message has its own <strong>Save as wiki page</strong>
            {" "}link; the whole chat has an <strong>Ingest → wiki</strong>{" "}
            button in the header so the synthesis becomes permanent pages.
          </SubCard>
        </div>
      </Section>

      <Section
        id="lint"
        eyebrow="Wiki health"
        title="Lint — finding rot before it spreads"
      >
        <p>
          <Link href="/lint" className="text-primary underline underline-offset-2">
            /lint
          </Link>{" "}
          runs two passes: a fast local scan (broken{" "}
          <code>[[wikilinks]]</code>, orphan pages) and an LLM pass for things
          a local scan can't see (contradictions between pages, missing pages
          that probably should exist, stale claims, gaps).
        </p>
        <p>Per-issue fix buttons:</p>
        <ul className="space-y-1">
          <li>
            <strong>Remove broken link</strong> — strips the bad{" "}
            <code>[[slug]]</code> from its host page. Local, free, instant.
          </li>
          <li>
            <strong>Create page</strong> / <strong>Create stub</strong> —
            drafts a small page for a missing slug using context from the
            pages that reference it. LLM-powered, ~$0.01 per click.
          </li>
          <li>
            <strong>Apply suggested fix</strong> — sends the affected page +
            the LLM's suggestion to the lint model, writes the rewritten
            page back. Backed up to{" "}
            <code>.llm-wiki/page-history/</code>.
          </li>
        </ul>
        <p>Bulk fixes at the top of the page:</p>
        <ul className="space-y-1">
          <li>
            <strong>Rebuild index</strong> — rewrites <code>index.md</code>{" "}
            from the page files on disk. Adds missing entries, removes
            orphans. Free, local.
          </li>
          <li>
            <strong>Remove all broken links (N)</strong> — confirm-then-apply
            for every local-detected broken link in one pass.
          </li>
        </ul>
        <p>
          The <strong>Recent runs</strong> panel shows the trend — each lint
          run gets a one-line entry in <code>log.md</code>. After fixes, re-run
          and watch the count drop (in green).
        </p>
      </Section>

      <Section
        id="graph"
        eyebrow="Seeing the shape"
        title="Graph — your knowledge as a 3D network"
      >
        <p>
          <Link href="/graph" className="text-primary underline underline-offset-2">
            /graph
          </Link>{" "}
          renders your wiki as a 3D force-directed graph. Each page is a node;
          each <code>[[wikilink]]</code> between two pages is an edge. The same
          look-and-feel as Obsidian's graph view, but with one important
          difference:
        </p>
        <p>
          <strong>Nodes are colored by page type</strong>, not by tag or folder.
          The LLM assigns a type to every page during ingest, so the graph gives
          you an at-a-glance read of what kind of knowledge your wiki holds:
        </p>
        <ul className="space-y-1">
          <li>
            <span className="font-medium" style={{ color: "#dc2626" }}>Red</span>
            {" "}— Overviews (high-level synthesis pages)
          </li>
          <li>
            <span className="font-medium" style={{ color: "#0891b2" }}>Cyan</span>
            {" "}— Concepts (ideas, techniques, frameworks)
          </li>
          <li>
            <span className="font-medium" style={{ color: "#d97706" }}>Amber</span>
            {" "}— Entities (people, organizations, places)
          </li>
          <li>
            <span className="font-medium" style={{ color: "#7c3aed" }}>Violet</span>
            {" "}— Comparisons (two-or-more-things contrasted)
          </li>
          <li>
            <span className="font-medium" style={{ color: "#64748b" }}>Slate</span>
            {" "}— Source-type pages
          </li>
        </ul>
        <p>
          <strong>Node size</strong> scales with link count (degree). Heavily-
          connected pages grow larger — they're your wiki's central concepts.
          <strong> Particles flowing along edges</strong> show direction.
        </p>
        <p>
          <strong>Click a node</strong> to focus it: the camera flies to it,
          neighbors stay full-color, non-neighbors fade out. The side panel
          shows the page's preview, tags, and a clickable list of every
          connected page — letting you walk the graph by associations instead
          of by name. URL updates to <code>/graph?node=&lt;slug&gt;</code> so
          you can bookmark or share a focused view.
        </p>
        <p>
          As you ingest more sources you'll watch the graph grow: new nodes
          spring into place, and edges form from any existing pages that
          mention the new one.
        </p>
      </Section>

      <Section
        id="schema"
        eyebrow="Telling the LLM what you want"
        title="Schema — editing CLAUDE.md"
      >
        <p>
          <Link href="/schema" className="text-primary underline underline-offset-2">
            /schema
          </Link>{" "}
          is a split-pane editor for the schema file the LLM reads on every
          operation. Default contents are generic; replace with your specifics
          to make the agent's output dramatically better.
        </p>
        <p>What works well in a schema:</p>
        <ul className="space-y-1">
          <li>What this wiki is about, in 1–3 sentences.</li>
          <li>
            What kinds of pages you want (and don't want) — e.g. <em>"entities
            for researchers but not for institutions"</em>.
          </li>
          <li>Naming conventions for slugs you care about.</li>
          <li>
            Subject-matter pet peeves the LLM should respect (e.g.{" "}
            <em>"don't conflate quantum advantage with quantum supremacy"</em>).
          </li>
        </ul>
        <p>
          Saves back up the prior version to{" "}
          <code>.llm-wiki/schema-history/</code> (last 10 kept).
        </p>
      </Section>

      <Section
        id="settings"
        eyebrow="Tuning the loop"
        title="Settings — models, costs, key"
      >
        <ul className="space-y-1">
          <li>
            <strong>General</strong> — wiki topic, theme (light / dark / auto).
          </li>
          <li>
            <strong>Models</strong> — pick a model for each operation (ingest,
            query, chat, lint, vision). Dropdowns of curated choices plus a
            custom-slug field for anything else OpenRouter supports.
          </li>
          <li>
            <strong>API</strong> — OpenRouter key. Test before saving; mask
            after.
          </li>
          <li>
            <strong>Costs</strong> — running tally of input/output tokens per
            model + estimated $ spend.
          </li>
          <li>
            <strong>About</strong> — version, license, links.
          </li>
        </ul>
        <p>
          Rule of thumb: cheap-fast model for ingest (you'll run it a lot),
          smarter model for query / lint / chat (user-facing answers).
        </p>
      </Section>

      <Section
        id="disk"
        eyebrow="The folder"
        title="Where everything lives on disk"
      >
        <p>
          Your wiki folder (default <code>~/llm-wiki-default</code>, override
          with <code>LLM_WIKI_PATH</code>):
        </p>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-4 text-[12px] leading-relaxed">
{`~/llm-wiki-default/
├── CLAUDE.md              # the schema you edit at /schema
├── index.md               # auto-maintained catalog of pages
├── log.md                 # every ingest / edit / lint / schema-save
├── raw/                   # original source files, untouched
├── wiki/                  # LLM-maintained pages
├── chats/                 # chat threads as .md files
└── .llm-wiki/             # SQLite + page-history + schema-history`}
        </pre>
        <p>
          You can browse <code>log.md</code> through the app at{" "}
          <Link href="/log" className="text-primary underline underline-offset-2">
            /log
          </Link>
          . Everything else is plain markdown — open it in Obsidian, VS Code,
          vim, or sync with iCloud / git. If you uninstall the app, the
          folder remains valid and useful.
        </p>
      </Section>

      <Section
        id="troubleshooting"
        eyebrow="When things go sideways"
        title="Troubleshooting"
      >
        <ul className="space-y-3">
          <Trouble
            symptom="“OpenRouter API key not configured”"
            fix="Open Settings → API and paste a key from openrouter.ai/keys."
          />
          <Trouble
            symptom="“model not available on OpenRouter: anthropic/claude-3-5-sonnet”"
            fix="Providers retire models periodically. Settings → Models → switch the affected slot to a current model from the dropdown."
          />
          <Trouble
            symptom='"LLM response failed schema validation"'
            fix="The model returned malformed JSON. Click Ingest again — small models occasionally drift. If it keeps happening, switch the ingest slot to a smarter model (Sonnet, GPT-4o)."
          />
          <Trouble
            symptom="Lint keeps flagging the same fixed issue"
            fix="The page got edited but the index summary went stale. Click Rebuild index in the Lint page's Bulk fixes."
          />
          <Trouble
            symptom="Dev server feels slow / clicks not registering"
            fix="Dev-mode Next.js compiles routes lazily. First click to a route is slow; subsequent are fast. Loading skeletons should appear instantly — if they don't, refresh the browser."
          />
        </ul>
      </Section>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/about"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          ← Back to About
        </Link>
        <Link
          href="/developers"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          Building or extending it? Developers page →
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

function Layer({ name, what }: { name: string; what: string }) {
  return (
    <li className="rounded-md border border-border/70 bg-card p-3">
      <code className="font-mono text-[13px] text-primary">{name}</code>
      <span className="ml-2 text-ui text-muted-foreground">— {what}</span>
    </li>
  );
}

function Op({ name, what }: { name: string; what: string }) {
  return (
    <li className="rounded-md border border-border/70 bg-card p-3">
      <span className="font-display text-h3 font-medium text-primary">
        {name}
      </span>
      <span className="ml-2 text-ui text-muted-foreground">— {what}</span>
    </li>
  );
}

function SubCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card p-4">
      <p className="font-display text-h3 font-medium tracking-tight">{title}</p>
      <div className="mt-1 text-ui text-muted-foreground">{children}</div>
    </div>
  );
}

function Trouble({ symptom, fix }: { symptom: string; fix: string }) {
  return (
    <li className="rounded-md border border-border/70 bg-card p-3">
      <p className="font-medium">{symptom}</p>
      <p className="mt-1 text-ui text-muted-foreground">{fix}</p>
    </li>
  );
}

const TOC: Array<{ id: string; label: string }> = [
  { id: "overview", label: "Mental model — three layers, three operations" },
  { id: "setup", label: "First-run: topic + API key" },
  { id: "sources", label: "Sources — getting content in" },
  { id: "wiki", label: "The wiki — browsing your pages" },
  { id: "query", label: "Query vs Chats" },
  { id: "lint", label: "Lint — wiki health" },
  { id: "graph", label: "Graph — 3D network view" },
  { id: "schema", label: "Schema — editing CLAUDE.md" },
  { id: "settings", label: "Settings — models, costs, key" },
  { id: "disk", label: "Where everything lives on disk" },
  { id: "troubleshooting", label: "Troubleshooting" },
];
