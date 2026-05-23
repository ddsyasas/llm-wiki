import Link from "next/link";

import {
  getTotalCostCents,
  listChatRows,
  listPageRows,
  listSourceRows,
} from "@llm-wiki/core";

import { openWikiContext, resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await openWikiContext();
  let pageCount = 0;
  let sourceCount = 0;
  let chatCount = 0;
  let costCents = 0;
  try {
    pageCount = listPageRows(ctx.db).length;
    sourceCount = listSourceRows(ctx.db).length;
    chatCount = listChatRows(ctx.db).length;
    costCents = getTotalCostCents(ctx.db);
  } finally {
    ctx.db.close();
  }
  const wikiPath = resolveWikiPath();
  const isFresh = pageCount === 0 && sourceCount === 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-12">
      <header className="mb-10">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">
          {isFresh ? "Welcome" : "Your wiki"}
        </p>
        <h1 className="mt-2 font-display text-display font-semibold">
          {isFresh ? "Build a wiki the LLM maintains for you." : "LLM Wiki"}
        </h1>
        <p className="mt-3 max-w-2xl text-body text-muted-foreground">
          {isFresh
            ? "Drop in articles, papers, notes, or URLs. The agent compiles them into a persistent, cross-linked markdown wiki you fully own. Knowledge compounds."
            : "Local-first knowledge base maintained by an LLM agent."}
        </p>
        <p className="mt-2 font-mono text-caption text-muted-foreground">
          {wikiPath}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Pages" value={pageCount.toString()} href="/wiki" />
        <StatTile label="Sources" value={sourceCount.toString()} href="/sources" />
        <StatTile label="Chats" value={chatCount.toString()} href="/chats" />
        <StatTile label="LLM spend" value={formatCost(costCents)} href="/settings" />
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <ActionCard
          tone="primary"
          title={isFresh ? "Add your first source" : "Add a source"}
          body="Paste an article, drop a PDF, or pull a URL. The agent reads it, writes pages, and cross-links."
          cta="Open Sources →"
          href="/sources"
        />
        <ActionCard
          title="Ask a question"
          body="One-off Q&A against the wiki with citations. Promote good answers into permanent pages."
          cta="Open Query →"
          href="/query"
        />
        <ActionCard
          title="Browse the wiki"
          body={
            pageCount === 0
              ? "Empty for now. Add a source to start filling it in."
              : `${pageCount} page${pageCount === 1 ? "" : "s"} across concepts, entities, and overviews.`
          }
          cta={pageCount === 0 ? "Add a source first →" : "Open Wiki →"}
          href={pageCount === 0 ? "/sources" : "/wiki"}
        />
      </section>

      <section className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetaCard
          title="How it works"
          items={[
            "Three layers on disk: raw sources, LLM-maintained wiki, your CLAUDE.md schema.",
            "Three operations: ingest, query, lint. All run against your folder.",
            "Everything is a markdown file — git it, sync it with iCloud, edit in Obsidian.",
          ]}
        />
        <MetaCard
          title="Keyboard"
          items={[
            { kbd: "⌘K", text: "Command palette — jump anywhere" },
            { kbd: "⌘,", text: "Settings" },
            { kbd: "⌘↵", text: "Submit (in form / chat composer)" },
            { kbd: "esc", text: "Close dialog" },
          ]}
        />
      </section>
    </div>
  );
}

// ---- bits ---------------------------------------------------------------

function StatTile({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border/70 bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-h2 font-semibold tabular-nums">{value}</p>
    </Link>
  );
}

function ActionCard({
  tone = "default",
  title,
  body,
  cta,
  href,
}: {
  tone?: "default" | "primary";
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  const primary = tone === "primary";
  return (
    <Link
      href={href}
      className={
        "group flex flex-col rounded-lg border p-5 transition-colors " +
        (primary
          ? "border-primary/40 bg-primary/[0.04] hover:border-primary/60 hover:bg-primary/[0.07]"
          : "border-border/70 bg-card hover:border-border")
      }
    >
      <h2 className="font-display text-h3 font-semibold">{title}</h2>
      <p className="mt-2 flex-1 text-ui text-muted-foreground">{body}</p>
      <p
        className={
          "mt-4 text-ui font-medium " +
          (primary ? "text-primary" : "text-foreground/80 group-hover:text-foreground")
        }
      >
        {cta}
      </p>
    </Link>
  );
}

type MetaItem = string | { kbd: string; text: string };

function MetaCard({ title, items }: { title: string; items: MetaItem[] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-5">
      <h2 className="font-display text-h3 font-semibold">{title}</h2>
      <ul className="mt-3 space-y-1.5 text-ui text-muted-foreground">
        {items.map((it, i) =>
          typeof it === "string" ? (
            <li key={i} className="leading-relaxed">
              · {it}
            </li>
          ) : (
            <li key={i} className="flex items-center gap-2.5">
              <kbd className="inline-flex min-w-[2.5rem] justify-center rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
                {it.kbd}
              </kbd>
              <span>{it.text}</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
  if (cents < 100) return `$${(cents / 100).toFixed(3)}`;
  return `$${(cents / 100).toFixed(2)}`;
}
