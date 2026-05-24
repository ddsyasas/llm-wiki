// Graph builder for the 3D vault view (/graph). Walks every page in the
// wiki, extracts [[wikilinks]] via the existing parser in links.ts, and
// returns a {nodes, links} structure ready for react-force-graph-3d.
//
// Design choices documented in docs/12-graph-view.md. Key ones here:
// - We pull the slug list from SQLite (already FS-synced via syncWikiToDb)
//   and read page bodies from disk for link extraction. Single pass.
// - Broken links (slugs in [[…]] that don't exist as files) are dropped
//   silently. Lint is the surface for broken-link surfacing; the graph
//   shouldn't double-report.
// - Self-links are dropped (no edge from a slug to itself).
// - Each (source, target) pair is deduped — a page that links to the same
//   target twice still produces one edge.

import type { Db } from "./db";
import { listPageRows } from "./db-pages";
import { uniqueLinkedSlugs } from "./links";
import type { PageType } from "./types";
import { readPage } from "./wiki";

export type GraphNode = {
  /** Page slug — the unique id. */
  id: string;
  /** Human-readable title from frontmatter. */
  title: string;
  /** Page type — drives node color in the 3D scene. */
  group: PageType;
  /** First ~280 chars of body with wikilinks flattened, for the side panel. */
  preview: string;
  /** Total inbound + outbound link count. Drives node size in the 3D scene. */
  degree: number;
  /** Frontmatter tags, surfaced as chips in the side panel. */
  tags: string[];
};

export type GraphLink = {
  source: string;
  target: string;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

const PREVIEW_LEN = 280;

function flattenPreview(body: string): string {
  // Strip wikilink brackets so the preview reads as prose.
  // [[slug|Display]] → Display, [[slug]] → slug.
  const stripped = body
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    // Drop the opening "# Title" line if present so the preview doesn't
    // start with the title we already show above it.
    .replace(/^#+\s+.*$/m, "")
    .trim();
  const oneLine = stripped.replace(/\s+/g, " ").trim();
  if (oneLine.length <= PREVIEW_LEN) return oneLine;
  return oneLine.slice(0, PREVIEW_LEN).trimEnd() + "…";
}

export async function buildGraph(wikiPath: string, db: Db): Promise<GraphData> {
  const rows = listPageRows(db);
  const knownSlugs = new Set(rows.map((r) => r.slug));

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const seenEdges = new Set<string>();
  const degree = new Map<string, number>();
  for (const r of rows) degree.set(r.slug, 0);

  for (const row of rows) {
    let body = "";
    try {
      const page = await readPage(wikiPath, row.slug);
      body = page.content;
    } catch {
      // Page row exists in DB but file is missing (rare drift). Skip — it'll
      // still appear as a node from the row, just no outbound edges.
    }

    const linked = uniqueLinkedSlugs(body);
    for (const target of linked) {
      if (target === row.slug) continue; // no self-edges
      if (!knownSlugs.has(target)) continue; // broken links are lint's job
      const key = `${row.slug}->${target}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      links.push({ source: row.slug, target });
      degree.set(row.slug, (degree.get(row.slug) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }

    nodes.push({
      id: row.slug,
      title: row.title,
      group: row.type,
      preview: flattenPreview(body),
      degree: 0, // filled in below
      tags: row.tags,
    });
  }

  for (const n of nodes) n.degree = degree.get(n.id) ?? 0;

  return { nodes, links };
}
