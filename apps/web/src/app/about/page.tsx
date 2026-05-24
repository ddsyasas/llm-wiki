import Link from "next/link";

import { PageContainer } from "@/components/page-shell";
import { APP_VERSION } from "@/components/footer";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return (
    <PageContainer width="lg">
      {/* Hero — Fraunces title sets the scholarly tone the rest of the page
          tries to live up to. */}
      <header className="mb-12">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">
          About
        </p>
        <h1 className="mt-2 font-display text-display font-semibold tracking-tight">
          A personal Wikipedia an LLM maintains for you.
        </h1>
        <p className="mt-5 max-w-2xl text-body font-serif text-muted-foreground">
          You drop in sources — papers, articles, notes, URLs. An LLM agent
          reads them, writes cross-linked pages, keeps an index, and revises
          older pages when new sources change the picture. The result is a
          knowledge base that <em>compounds</em>: each source makes every page
          richer, not just one new page longer.
        </p>
      </header>

      <Section eyebrow="The pattern" title="Built on Karpathy's idea">
        <p>
          In April 2026 Andrej Karpathy{" "}
          <a
            href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            sketched a pattern
          </a>{" "}
          for personal knowledge bases that treats the LLM as the
          knowledge-engineer rather than the search-engine. Three layers (raw
          sources, the LLM-maintained wiki, a schema the LLM reads on every
          call) and three operations (ingest, query, lint) form a loop that
          gets better as you feed it.
        </p>
        <blockquote className="my-4 border-l-2 border-primary/40 pl-4 font-serif italic text-foreground/80">
          “Obsidian is the IDE. The LLM is the programmer. The wiki is the
          codebase.”
        </blockquote>
        <p>
          LLM Wiki is an open-source implementation of that pattern — local-
          first, bring-your-own-key, plain markdown all the way down. You can
          delete the app and your wiki keeps working.
        </p>
      </Section>

      <Section
        eyebrow="What you get"
        title="The wiki + a 3D view of its shape"
      >
        <p>
          Your knowledge ends up in two complementary views:
        </p>
        <ul className="space-y-1">
          <li>
            <strong>The wiki itself</strong> — markdown pages grouped by type
            (overviews, concepts, entities, comparisons, sources), with full
            backlinks and source-lineage trails. Read it like a textbook,
            search it, edit it.
          </li>
          <li>
            <strong>A 3D graph</strong> of every page and every cross-link —
            same engine and look as Obsidian's graph view, but colored by{" "}
            <em>page type</em> rather than free-form tag. Watch your knowledge
            literally grow over time as you ingest more sources; orphans and
            hubs become spatially obvious.
          </li>
        </ul>
      </Section>

      <Section eyebrow="Why it exists" title="The gap nobody was filling">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SubCard title="RAG chat (NotebookLM, ChatGPT files)">
            Stateless. Rediscovers your corpus from scratch on every query.
            Never accumulates anything you can read later.
          </SubCard>
          <SubCard title="Note-taking apps (Obsidian, Notion)">
            All the maintenance burden on the human. You write, you cross-link,
            you check for contradictions. Nothing scales.
          </SubCard>
        </div>
        <p className="mt-4">
          LLM Wiki sits between them. The LLM does the maintenance; the wiki
          accumulates value; you own the files. After three months of feeding
          it, you have a navigable, cited, deliberately-organized body of
          knowledge about whatever you care about — without ever having
          written a page yourself.
        </p>
      </Section>

      <Section
        eyebrow="One wiki, or several"
        title="A wiki per topic — switch with one click"
      >
        <p>
          A wiki is meant to focus on one topic — the schema you set on first
          run keeps the LLM on scope. For separate topics (say{" "}
          <em>Physics</em>, <em>ML research</em>, and a{" "}
          <em>Personal knowledge base</em>) you keep separate wiki folders and
          switch between them in{" "}
          <Link href="/settings" className="text-primary underline underline-offset-2">
            Settings → Wikis
          </Link>
          . Switching re-points the whole app on the next request — no restart,
          no port juggling. Each wiki is its own folder you fully own.
        </p>
      </Section>

      <Section eyebrow="Who it's for" title="If any of these describe you">
        <ul className="space-y-2">
          {AUDIENCE.map((row) => (
            <li
              key={row.who}
              className="flex flex-col gap-1 rounded-md border border-border/70 bg-card p-4 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="font-display text-h3 font-medium tracking-tight sm:w-44">
                {row.who}
              </span>
              <span className="text-ui text-muted-foreground">{row.what}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Principles" title="What it refuses to do">
        <ul className="space-y-2">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="border-l-2 border-border pl-4">
              <p className="font-medium text-foreground">{p.title}</p>
              <p className="mt-0.5 text-ui text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Tech" title="The stack, briefly">
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
        <p className="mt-4 text-caption text-muted-foreground">
          For the deep dive, see the{" "}
          <Link
            href="/developers"
            className="text-primary underline underline-offset-2"
          >
            Developers page
          </Link>{" "}
          or the{" "}
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
      </Section>

      <Section eyebrow="Credits" title="Made by Yasas. Pattern by Karpathy.">
        <p>
          Built by{" "}
          <a
            href="https://github.com/ddsyasas"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Yasas
          </a>{" "}
          as a from-scratch implementation of the LLM Wiki pattern{" "}
          <a
            href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            described by Andrej Karpathy
          </a>
          . Released under the MIT license. Contributions and forks welcome on{" "}
          <a
            href="https://github.com/ddsyasas/llm-wiki"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            GitHub
          </a>
          .
        </p>
        <p className="mt-2 text-caption text-muted-foreground">
          v{APP_VERSION} · Install via{" "}
          <a
            href="https://github.com/ddsyasas/llm-wiki/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            GitHub Releases
          </a>{" "}
          (<code>npm install -g</code> the tarball). Verified on macOS, Linux, Windows.
        </p>
        <p className="mt-2 text-caption text-muted-foreground">
          LLM Wiki is not affiliated with Andrej Karpathy or Anthropic; the
          pattern is his, the implementation is independent.
        </p>
      </Section>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/help"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          New here? Read the Help guide →
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
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
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
      <p className="mt-1 text-ui text-muted-foreground">{children}</p>
    </div>
  );
}

const AUDIENCE: Array<{ who: string; what: string }> = [
  {
    who: "Researchers",
    what: "Synthesize a literature you keep coming back to. Citations stay attached to claims, contradictions surface in lint.",
  },
  {
    who: "Lawyers / paralegals",
    what: "Build a working knowledge of a case or a regulatory area. Every claim traces back to the source document on disk.",
  },
  {
    who: "Doctors / clinicians",
    what: "Keep a private reference of guidelines, studies, and your own notes. No cloud upload of patient-adjacent material.",
  },
  {
    who: "Journalists / analysts",
    what: "Beat-reporting where the same names, orgs, dates keep recurring. The wiki becomes your second brain for the story.",
  },
  {
    who: "Educators",
    what: "Build a course outline that updates itself as you ingest new readings. Cross-references stay live.",
  },
  {
    who: "Indie hackers / technical founders",
    what: "A private knowledge base for the market you're building in. Ingest competitor docs, customer notes, your own decisions.",
  },
];

const PRINCIPLES: Array<{ title: string; body: string }> = [
  {
    title: "Files over databases.",
    body: "Every artifact you might want to keep is a markdown file in a folder you chose. SQLite is metadata only — safe to delete, regenerable.",
  },
  {
    title: "No lock-in.",
    body: "Open standards (Markdown, SQLite), bring-your-own-key for the LLM. Uninstall the app, your wiki still works in any editor.",
  },
  {
    title: "The agent does the work.",
    body: "You shouldn't have to manually update cross-references, generate summaries, or maintain an index. The LLM compiles; you read.",
  },
  {
    title: "Honest costs.",
    body: "Every operation tells you roughly what it will cost in tokens before it runs. No surprise bills.",
  },
  {
    title: "Local-first, BYOK.",
    body: "No telemetry, no remote storage, no auth. You bring your own OpenRouter key; we never see it.",
  },
];

const STACK: Array<{ label: string; value: string }> = [
  { label: "Framework", value: "Next.js 14 (App Router), TypeScript strict" },
  { label: "UI", value: "Tailwind + shadcn-style components, Fraunces / Crimson Pro / Inter" },
  { label: "Storage", value: "Plain markdown files + SQLite (better-sqlite3) for metadata" },
  { label: "LLM", value: "OpenRouter (BYOK) — Claude / GPT / Gemini / Llama, you pick per operation" },
  { label: "Search", value: "FTS5 on page bodies + frontmatter title/tags" },
  { label: "Ingestion", value: "mammoth (DOCX), officeparser (XLSX/PPTX), @mozilla/readability (HTML/URL), vision models for PDF/image" },
  { label: "License", value: "MIT" },
];
