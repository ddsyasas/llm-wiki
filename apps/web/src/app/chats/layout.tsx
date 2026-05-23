import Link from "next/link";

import { ChatsSidebar } from "@/components/chats/sidebar";

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <Link href="/" className="font-semibold tracking-tight">
          LLM Wiki
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/wiki" className="text-muted-foreground hover:text-foreground">
            Wiki
          </Link>
          <Link href="/sources" className="text-muted-foreground hover:text-foreground">
            Sources
          </Link>
          <Link href="/query" className="text-muted-foreground hover:text-foreground">
            Query
          </Link>
          <Link href="/chats" className="text-muted-foreground hover:text-foreground">
            Chats
          </Link>
          <Link href="/lint" className="text-muted-foreground hover:text-foreground">
            Lint
          </Link>
          <Link href="/settings" className="text-muted-foreground hover:text-foreground">
            Settings
          </Link>
        </nav>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ChatsSidebar />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
