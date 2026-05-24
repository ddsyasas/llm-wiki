"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

// Primary destinations — what most actions converge on. Reads in the order a
// user would naturally encounter them in a session (knowledge in, knowledge
// out, conversation, hygiene).
const PRIMARY_NAV = [
  { label: "Wiki", href: "/wiki" },
  { label: "Graph", href: "/graph" },
  { label: "Sources", href: "/sources" },
  { label: "Query", href: "/query" },
  { label: "Chats", href: "/chats" },
  { label: "Lint", href: "/lint" },
] as const;

// Utility cluster — config + meta. Kept visually separate from primary nav.
const UTIL_NAV = [
  { label: "Schema", href: "/schema" },
  { label: "Settings", href: "/settings" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-6 border-b border-border/70 bg-background/85 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Wordmark — Fraunces gives the scholarly voice docs/08 asked for. */}
      <Link
        href="/"
        className="group flex items-center gap-2.5"
        aria-label="Home"
      >
        <span
          aria-hidden
          className="font-mono text-[15px] leading-none text-primary transition-transform group-hover:scale-110"
        >
          [[
        </span>
        <span className="font-display text-[17px] font-semibold tracking-tight">
          LLM Wiki
        </span>
      </Link>

      {/* Primary destinations — left-anchored next to wordmark so the cluster
          reads as one navigation system. Active item gets a thin underline. */}
      <nav className="hidden items-center gap-5 text-ui sm:flex">
        {PRIMARY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn("nav-link", isActive(item.href) && "is-active")}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-1 items-center justify-end gap-3">
        {/* Hint at Cmd+K — visible affordance for the command palette.
            Sans font (not mono) so the ⌘ glyph renders cleanly at small
            sizes; mono fonts often mis-baseline it. */}
        <kbd className="hidden h-6 items-center gap-0.5 rounded-md border border-border bg-muted/60 px-1.5 font-sans text-[11px] font-medium leading-none text-muted-foreground md:inline-flex">
          <span>⌘</span>K
        </kbd>

        <nav className="hidden items-center gap-4 text-ui sm:flex">
          {UTIL_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-link", isActive(item.href) && "is-active")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <ThemeToggle />

        {/* Compact mobile nav — only on small screens. */}
        <details className="relative sm:hidden">
          <summary className="cursor-pointer list-none rounded p-1 text-muted-foreground hover:text-foreground">
            <span className="font-mono text-sm">≡</span>
          </summary>
          <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-md border border-border bg-popover py-1 text-ui shadow-lg">
            {[...PRIMARY_NAV, ...UTIL_NAV].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block px-3 py-1.5 hover:bg-accent",
                  isActive(item.href) && "text-primary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </header>
  );
}
