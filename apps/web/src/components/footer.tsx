// Per docs/08 line 246 + docs/11 attribution rules. Shown on every screen so
// the project's authorship + Karpathy origin are always one click away.

import Link from "next/link";

import { loadWikiSettings } from "@llm-wiki/core";

import { resolveWikiPath } from "@/lib/server-wiki";

export const APP_VERSION = "1.1.0";

// Active-wiki hint reads the active wiki's topic server-side so it's
// rendered before paint — no flash, no client-side fetch. Best-effort:
// any error reading the topic just omits the hint instead of throwing.
async function readActiveTopic(): Promise<string | null> {
  try {
    const settings = await loadWikiSettings(resolveWikiPath());
    const topic = settings.topic.trim();
    return topic.length > 0 ? topic : null;
  } catch {
    return null;
  }
}

export async function Footer({ className = "" }: { className?: string }) {
  const activeTopic = await readActiveTopic();

  return (
    <footer
      className={
        "border-t border-border bg-secondary/30 px-4 py-2 text-[11px] text-muted-foreground " +
        className
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span>
          LLM Wiki by{" "}
          <Link
            href="https://github.com/ddsyasas"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Yasas
          </Link>
        </span>
        <span aria-hidden>·</span>
        <span>v{APP_VERSION}</span>
        {activeTopic ? (
          <>
            <span aria-hidden>·</span>
            <Link
              href="/settings?tab=wikis"
              className="max-w-[16rem] truncate hover:text-foreground"
              title={`Active wiki — click to switch (${activeTopic})`}
            >
              <span aria-hidden className="text-muted-foreground/70">⌂</span>{" "}
              {activeTopic}
            </Link>
          </>
        ) : null}
        <span aria-hidden>·</span>
        <Link
          href="/dashboard"
          className="hover:text-foreground"
          title="Per-wiki page / source / chat counts + cumulative LLM spend across every wiki"
        >
          Dashboard
        </Link>
        <span aria-hidden>·</span>
        <Link href="/about" className="hover:text-foreground">
          About
        </Link>
        <span aria-hidden>·</span>
        <Link href="/help" className="hover:text-foreground">
          Help
        </Link>
        <span aria-hidden>·</span>
        <Link href="/developers" className="hover:text-foreground">
          Developers
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="https://github.com/ddsyasas/llm-wiki"
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground"
        >
          GitHub
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground"
        >
          Pattern by Karpathy
        </Link>
      </div>
    </footer>
  );
}
