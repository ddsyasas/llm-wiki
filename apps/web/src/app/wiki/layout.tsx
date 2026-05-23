import Link from "next/link";

import { WikiSidebar } from "@/components/wiki/sidebar";

export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <Link href="/" className="font-semibold tracking-tight">
          LLM Wiki
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/wiki" className="hover:text-foreground text-muted-foreground">
            Wiki
          </Link>
          <Link href="/sources" className="hover:text-foreground text-muted-foreground">
            Sources
          </Link>
          <Link href="/query" className="hover:text-foreground text-muted-foreground">
            Query
          </Link>
          <Link href="/chats" className="hover:text-foreground text-muted-foreground">
            Chats
          </Link>
          <Link href="/lint" className="hover:text-foreground text-muted-foreground">
            Lint
          </Link>
          <Link href="/settings" className="hover:text-foreground text-muted-foreground">
            Settings
          </Link>
        </nav>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <WikiSidebar />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
