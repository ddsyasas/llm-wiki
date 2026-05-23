import Link from "next/link";

import { CORE_VERSION } from "@llm-wiki/core";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">LLM Wiki</h1>
        <p className="mt-2 text-muted-foreground">
          Local-first knowledge base maintained by an LLM agent.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          core <code>v{CORE_VERSION}</code>
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/wiki">Browse wiki</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/query">Ask a question</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/sources">Add a source</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/chats">Chats</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/settings">Settings</Link>
        </Button>
      </div>
    </main>
  );
}
