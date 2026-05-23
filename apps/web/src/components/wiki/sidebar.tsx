"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PageSummary = {
  slug: string;
  title: string;
  type: string;
  updated_at: string;
};

const TYPE_ORDER = ["overview", "concept", "entity", "comparison", "source"];
const TYPE_LABEL: Record<string, string> = {
  overview: "Overviews",
  concept: "Concepts",
  entity: "Entities",
  comparison: "Comparisons",
  source: "Sources",
};

export function WikiSidebar() {
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        const res = await fetch("/api/pages", { cache: "no-store" });
        if (!res.ok) throw new Error(`/api/pages returned ${res.status}`);
        const data = (await res.json()) as { pages: PageSummary[] };
        if (!cancelled) setPages(data.pages);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const grouped = useMemo(() => {
    if (!pages) return null;
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? pages.filter(
          (p) => p.slug.includes(needle) || p.title.toLowerCase().includes(needle),
        )
      : pages;
    const byType = new Map<string, PageSummary[]>();
    for (const p of filtered) {
      const list = byType.get(p.type) ?? [];
      list.push(p);
      byType.set(p.type, list);
    }
    for (const list of byType.values()) list.sort((a, b) => a.title.localeCompare(b.title));
    return byType;
  }, [pages, filter]);

  const activeSlug = pathname.startsWith("/wiki/") ? pathname.slice("/wiki/".length) : null;
  const isIndex = pathname === "/wiki";

  return (
    <aside className="flex w-[264px] shrink-0 flex-col self-stretch border-r border-border bg-secondary">
      <div className="px-4 pb-2 pt-4">
        <Input
          type="search"
          placeholder="Filter pages…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 border-border/70 bg-background/60 text-ui"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 text-ui">
        <Link
          href="/wiki"
          className={cn(
            "mx-2 mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 font-medium",
            isIndex ? "bg-primary/10 text-foreground" : "text-foreground/70 hover:bg-accent/60",
          )}
        >
          <span className="font-mono text-[10px] text-primary">¶</span>
          Wiki index
        </Link>

        {error ? (
          <p className="px-3 text-caption text-destructive">{error}</p>
        ) : null}
        {!pages && !error ? (
          <p className="px-3 text-caption text-muted-foreground">Loading…</p>
        ) : null}
        {pages && pages.length === 0 ? (
          <div className="mx-2 mt-2 rounded-md border border-dashed border-border/70 bg-background/40 px-3 py-3 text-caption text-muted-foreground">
            No pages yet. Head to{" "}
            <Link href="/sources" className="text-foreground underline underline-offset-2">
              Sources
            </Link>{" "}
            to add one.
          </div>
        ) : null}

        {grouped
          ? TYPE_ORDER.filter((t) => grouped.has(t)).map((type) => {
              const items = grouped.get(type)!;
              return (
                <section key={type} className="mb-3">
                  <h3 className="mt-3 px-3 pb-1 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                    {TYPE_LABEL[type] ?? type}
                  </h3>
                  <ul>
                    {items.map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/wiki/${p.slug}`}
                          className={cn(
                            "mx-2 block truncate rounded-md px-2 py-1",
                            activeSlug === p.slug
                              ? "bg-primary/10 text-foreground"
                              : "text-foreground/70 hover:bg-accent/60",
                          )}
                          title={p.title}
                        >
                          {p.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          : null}
      </nav>
    </aside>
  );
}
