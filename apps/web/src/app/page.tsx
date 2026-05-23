import { CORE_VERSION } from "@llm-wiki/core";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">LLM Wiki</h1>
        <p className="mt-2 text-muted-foreground">Step 0 scaffold is alive.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Imported <code>CORE_VERSION</code> from{" "}
          <code>@llm-wiki/core</code>: <strong>{CORE_VERSION}</strong>
        </p>
      </div>
      <Button>shadcn Button works</Button>
    </main>
  );
}
