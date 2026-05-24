import Link from "next/link";

import { buildGraph } from "@llm-wiki/core";

import { PageContainer, PageHeader } from "@/components/page-shell";
import { VaultGraph } from "@/components/graph/vault-graph";
import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// Single param so the route is bookmarkable. The client component reads
// initialSelectedId on mount and flies the camera to that node once the
// force layout has settled.
type SearchParams = { node?: string };

export default async function GraphPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const ctx = await openWikiContext();
  let data;
  try {
    data = await buildGraph(ctx.wikiPath, ctx.db);
  } finally {
    ctx.db.close();
  }

  if (data.nodes.length === 0) {
    return (
      <PageContainer width="lg">
        <PageHeader
          eyebrow="Knowledge graph"
          title="Graph"
          description="A 3D view of your wiki — pages as nodes, [[wikilinks]] as edges. Drag to orbit, scroll to zoom, click a node to focus."
        />
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="font-display text-h3 font-semibold">
            Nothing to graph yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-ui text-muted-foreground">
            Add a source on the{" "}
            <Link
              href="/sources"
              className="text-primary underline underline-offset-2"
            >
              Sources
            </Link>{" "}
            page. The agent will create pages here, and you'll watch the graph
            grow as you ingest more.
          </p>
        </div>
      </PageContainer>
    );
  }

  return <VaultGraph data={data} initialSelectedId={searchParams?.node} />;
}
