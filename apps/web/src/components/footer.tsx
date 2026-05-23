// Per docs/08 line 246 + docs/11 attribution rules. Shown on every screen so
// the project's authorship + Karpathy origin are always one click away.

import Link from "next/link";

export const APP_VERSION = "0.1.0";

export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer
      className={
        "border-t border-border bg-secondary/30 px-4 py-2 text-[11px] text-muted-foreground " +
        className
      }
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1">
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
