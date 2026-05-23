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
    // Refetch on route change so newly-ingested pages appear without a manual reload.
  }, [pathname]);

  const grouped = useMemo(() => {
    if (!pages) return null;
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? pages.filter((p) => p.slug.includes(needle) || p.title.toLowerCase().includes(needle))
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

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-secondary/30">
      <div className="border-b border-border p-3">
        <Input
          type="search"
          placeholder="Filter pages…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-3 text-sm">
        <Link
          href="/wiki"
          className={cn(
            "mb-3 block rounded px-2 py-1 font-medium",
            pathname === "/wiki"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Wiki index
        </Link>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {!pages && !error ? <p className="text-xs text-muted-foreground">Loading…</p> : null}
        {pages && pages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No pages yet. Add a source from{" "}
            <Link href="/sources" className="underline">
              Sources
            </Link>
            .
          </p>
        ) : null}

        {grouped
          ? TYPE_ORDER.filter((t) => grouped.has(t)).map((type) => {
              const items = grouped.get(type)!;
              return (
                <section key={type} className="mb-3">
                  <h3 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {type}
                  </h3>
                  <ul className="space-y-0.5">
                    {items.map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/wiki/${p.slug}`}
                          className={cn(
                            "block truncate rounded px-2 py-1",
                            activeSlug === p.slug
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/50",
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
