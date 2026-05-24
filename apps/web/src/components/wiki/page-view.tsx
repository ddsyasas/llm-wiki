"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MarkdownView } from "@/components/wiki/markdown-view";
import { PageEditor } from "@/components/wiki/page-editor";
import { cn } from "@/lib/utils";

type Backlink = { slug: string; title: string; excerpt: string };

type Props = {
  slug: string;
  title: string;
  type: "entity" | "concept" | "source" | "comparison" | "overview";
  created: string;
  updated: string;
  tags: ReadonlyArray<string>;
  content: string;
  backlinks: ReadonlyArray<Backlink>;
  knownSlugs: ReadonlyArray<string>;
};

export function PageView(props: Props) {
  const [editing, setEditing] = useState(false);

  return (
    // Reading view stays narrow (prose-friendly). Editing view expands to
    // give the split-pane markdown/preview room to breathe.
    <article
      className={cn(
        "mx-auto px-6 py-10",
        editing ? "max-w-[1400px]" : "max-w-3xl",
      )}
    >
      {!editing ? (
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{props.title}</h1>
            <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
              {props.type} · created {props.created} · updated {props.updated}
              {props.tags.length > 0 ? ` · ${props.tags.join(", ")}` : null}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        </header>
      ) : (
        <header className="mb-6 border-b border-border pb-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Editing {props.slug}
          </p>
        </header>
      )}

      {editing ? (
        <PageEditor
          slug={props.slug}
          initialTitle={props.title}
          initialType={props.type}
          initialContent={props.content}
          knownSlugs={props.knownSlugs}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <>
          <MarkdownView content={props.content} knownSlugs={props.knownSlugs} />

          <section className="mt-10 border-t border-border pt-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Backlinks ({props.backlinks.length})
            </h2>
            {props.backlinks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing else in the wiki links here yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {props.backlinks.map((b) => (
                  <li key={b.slug}>
                    <a
                      href={`/wiki/${b.slug}`}
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      {b.title}
                    </a>
                    <p className="mt-0.5 text-xs text-muted-foreground">{b.excerpt}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </article>
  );
}
