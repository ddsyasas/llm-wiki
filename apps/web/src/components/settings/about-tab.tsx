export function AboutTab() {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h2 className="text-lg font-medium">LLM Wiki</h2>
        <p className="mt-1 text-muted-foreground">
          Local-first knowledge base maintained by an LLM agent. Built by{" "}
          <a
            href="https://github.com/ddsyasas"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Yasas
          </a>
          .
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pattern
        </h3>
        <p className="mt-1 text-muted-foreground">
          Implements{" "}
          <a
            href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Andrej Karpathy&apos;s LLM Wiki pattern
          </a>{" "}
          — three layers (raw sources, wiki, schema), three operations (ingest, query, lint),
          one folder of markdown files. The wiki is a persistent compounding artifact, not
          query-time retrieval.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Privacy
        </h3>
        <p className="mt-1 text-muted-foreground">
          Everything runs on your machine. No telemetry, no analytics, no remote storage.
          API calls go only to OpenRouter. Your wiki content lives only in the folder you
          chose — sync it with git/Dropbox/iCloud if you want, or don&apos;t.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          License
        </h3>
        <p className="mt-1 text-muted-foreground">
          MIT. Source code at{" "}
          <a
            href="https://github.com/ddsyasas/llm-wiki"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            github.com/ddsyasas/llm-wiki
          </a>
          .
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Acknowledgements
        </h3>
        <p className="mt-1 text-muted-foreground">
          Built on Next.js, Tailwind, shadcn/ui, better-sqlite3, mammoth, gray-matter,
          chokidar, and the openai SDK pointed at OpenRouter.
        </p>
      </div>
    </div>
  );
}
