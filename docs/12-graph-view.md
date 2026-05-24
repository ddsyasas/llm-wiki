# 12 — 3D Graph View (Obsidian-style)

Status: **shipped** (2026-05-24). All phases complete except CLI subcommand and polish-tier camera persistence.

---

## What we're building

A 3D force-directed graph view of the wiki at `/graph`. Each wiki page is a node; each `[[wikilink]]` between pages is an edge. Drag to orbit, scroll to zoom, click a node to focus it and inspect its connections. A detail panel shows the selected page's preview, type, tags, and linked pages. Selection state lives in the URL (`/graph?node=peter-shor`) so views are shareable and deep-linkable.

The aesthetic target: Obsidian's 3D Graph plugin. Same engine, same interaction model. For a researcher / lawyer / clinician / educator, the graph turns the abstract claim "your wiki compounds" into a thing they can *see grow* as they ingest more sources.

---

## Why this fits the Karpathy framing

The wiki-as-codebase metaphor is what the project sells. The codebase view (`/wiki`) shows the files; the graph view shows the **call graph**. A page that's heavily linked-to is a "library" — a foundational concept lots of other pages depend on. An orphan is dead code. A tight cluster is a module. The graph makes the structure of your knowledge legible at a glance.

Lint currently reports orphans, broken links, missing pages — all of which are spatial properties the graph would visualize directly. Future overlay: color orphans differently, draw broken links as dashed red, etc.

---

## Library choice

**`react-force-graph-3d`** (Vasco Asturiano). Three.js + d3-force-3d under the hood. Same engine Obsidian's 3D Graph plugin uses, so look-and-feel matches expectations.

Two new deps in `apps/web`:

```bash
pnpm add -F @llm-wiki/web react-force-graph-3d three
```

`three` is the WebGL peer. Both are large (~600KB combined gzipped) — dynamic-imported with `ssr: false` so they only load when a user visits `/graph`. Doesn't affect any other route's bundle.

**Rejected alternatives:**
- `react-three-fiber` from scratch — would require implementing the force simulation ourselves
- `react-force-graph-2d` — user explicitly asked for 3D; we can add a 2D toggle later (the API is nearly identical)
- `cytoscape` / `vis-network` / `sigma` — 2D-first, weak 3D support

---

## How this differs from the chat-Claude brief

The user got a brief from a different Claude that doesn't have repo access. Most of it is right, but six things need adapting to this codebase:

| What the brief assumed | What this repo actually does |
|---|---|
| Subpath export `@llm-wiki/core/graph` | Package has a flat `index.ts` re-exporting everything. Add `export * from "./graph"` to that file. |
| Custom wikilink regex (`/\[\[([^\]|#]+)…\]\]/g`) | Already have `extractWikiLinks(content)` + `uniqueLinkedSlugs(content)` in `packages/core/src/links.ts`. Reuse. |
| Custom frontmatter parser | Already use `gray-matter` via `readPage(wikiPath, slug)` which returns `{ frontmatter, content }`. Reuse. |
| Env var `WIKI_VAULT_PATH` | We use `LLM_WIKI_PATH` and have `resolveWikiPath()` / `openWikiContext()` in `apps/web/src/lib/server-wiki.ts`. |
| Free-form `group` from tags | We have a strict `type` enum on every page: `concept` / `entity` / `comparison` / `source` / `overview`. Color by `type` instead — matches the existing /wiki card view's grouping. |
| File-walk + DB-query as two separate builders | `listPageRows(db)` is already FS-synced via `syncWikiToDb()` on every request. One builder is enough; it pulls from DB for the slug list, reads file bodies for wikilink extraction. |

Everything else from the brief (URL state via `window.history.replaceState`, MutationObserver on `<html>` for theme reactivity, the `flyTo` camera animation, the detail panel structure) maps onto this codebase as-is.

---

## File plan

### New

| File | What |
|---|---|
| `packages/core/src/graph.ts` | `GraphNode` / `GraphLink` / `GraphData` types + `buildGraph(wikiPath, db)` |
| `packages/core/src/graph.test.ts` | Unit tests for `buildGraph` (empty wiki / single page / links / broken-link skip / self-link skip) |
| `apps/web/src/app/graph/page.tsx` | Server component: opens wiki context, calls `buildGraph`, passes to client component |
| `apps/web/src/app/graph/loading.tsx` | Loading skeleton (likely a "loading graph" centered message — the 3D scene itself flashes when ready) |
| `apps/web/src/components/graph/vault-graph.tsx` | Client component: 3D scene + side panel + URL state |

### Modified

| File | Change |
|---|---|
| `packages/core/src/index.ts` | `export * from "./graph"` |
| `apps/web/package.json` | Add `react-force-graph-3d` + `three` deps |
| `apps/web/src/components/app-header.tsx` | Add `Graph` to `PRIMARY_NAV` after `Wiki` |
| `apps/web/src/app/page.tsx` | Maybe add a 5th home-page action card "Browse the graph", or skip if 4 feels right |
| `apps/web/next.config.mjs` | Possibly add `three` / `react-force-graph-3d` to `transpilePackages` if Next 14 + ESM has issues. Test before changing. |

---

## Graph builder shape

```ts
// packages/core/src/graph.ts

import type { Db } from "./db";
import { listPageRows } from "./db-pages";
import { uniqueLinkedSlugs } from "./links";
import { readPage } from "./wiki";
import type { PageType } from "./types";

export type GraphNode = {
  id: string;           // slug
  title: string;        // frontmatter.title
  group: PageType;      // concept | entity | comparison | source | overview
  preview: string;      // first ~280 chars of body, wikilinks stripped
  degree: number;       // total inbound + outbound link count
  tags: string[];
};

export type GraphLink = {
  source: string;       // slug
  target: string;       // slug
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

export async function buildGraph(wikiPath: string, db: Db): Promise<GraphData>;
```

Algorithm:
1. `listPageRows(db)` → all slugs/titles/types/tags.
2. Build `knownSlugs = new Set(rows.map(r => r.slug))`.
3. For each row: `readPage(wikiPath, slug)` → body. `uniqueLinkedSlugs(body)` → outbound slugs. For each target: skip self-links, skip slugs not in `knownSlugs` (those would be broken links → lint's job, not the graph's). Push `{source, target}` link.
4. Dedupe `(source, target)` pairs with a `Set` keyed on `"a->b"`.
5. Compute degree by counting each slug's appearances on either side of any link.
6. Strip `[[slug]]` markup from preview for clean text. Use first ~280 chars.

Edge cases handled:
- Missing page file (rare, would mean DB/disk drift) → skip the page, log? probably just skip silently.
- A page with no links → still gets a node (orphan node, degree 0).
- A page that links only to non-existent slugs → orphan from the graph's perspective (those broken links don't draw edges).

---

## Page color → type mapping

The 3D scene can't read CSS vars (WebGL canvas, not DOM). So we use a small hardcoded palette. Colors restrained but distinct enough for at-a-glance grouping. Aligned with the existing /wiki section ordering:

| Type | Color | Why |
|---|---|---|
| Overview | `#dc2626` | The wiki's primary accent red — overviews are the wiki's center of gravity |
| Concept | `#0891b2` | Cool, neutral, abundant in most wikis |
| Entity | `#d97706` | Warm — people / orgs / places feel different from abstract concepts |
| Comparison | `#7c3aed` | Distinct, since comparisons are bridging pages |
| Source | `#64748b` | Muted gray — sources are the substrate, not the focus |

Selected node turns near-white (`#fafaf9` to match `--background`). Neighbors keep their color. Non-neighbors fade to `rgba(120, 120, 130, 0.22)` so the focal subgraph pops.

Edges: muted white when nothing selected, primary red when connected to selected node.

---

## URL state

Selected node persists in URL as `?node=<slug>`. Two reads:

1. **Server-side** in `page.tsx`: pulls `searchParams.node` and passes as `initialSelectedId` so deep links work without a client-side flicker.
2. **Client-side** updates: `window.history.replaceState` instead of `useRouter().replace()` to avoid re-rendering the whole page on every click. The graph component owns the selection state; the URL is just a side-effect for shareability.

Background click (anywhere not on a node) clears selection.

---

## Theme reactivity

The 3D scene background needs to match the page background. CSS vars don't reach inside the WebGL canvas, so:

1. On mount, read `getComputedStyle(document.documentElement).getPropertyValue("--background")` and apply as `hsl(...)`.
2. `MutationObserver` on `<html>` watching the `class` attribute (our `ThemeProvider` toggles `.dark` there). Re-read + re-apply on flip.

The hardcoded type colors don't theme-flip — they look reasonable in both light and dark mode. If we want theme-aware type colors later, we'd add `--graph-overview` etc. CSS vars and read them via the same getComputedStyle pattern.

---

## Phases + checklist

Tick as we go.

### Phase 1: planning doc
- [x] This file

### Phase 2: core graph builder
- [x] `packages/core/src/graph.ts` — types + `buildGraph(wikiPath, db)`
- [x] Export from `packages/core/src/index.ts`
- [x] `packages/core/src/graph.test.ts` — 7 tests (originally 5, expanded during write):
  - empty wiki → `{ nodes: [], links: [] }`
  - single page, no links → 1 node, 0 links, degree 0
  - two pages linking to each other → 2 nodes, 2 links, both degree 2
  - link to non-existent slug → no edge (broken link skipped)
  - self-link `[[same-slug]]` in a page → no self-edge
  - same target linked multiple times → 1 dedup'd edge
  - wikilink brackets stripped from preview text
- [x] `pnpm test --run graph` passes (7/7)

### Phase 3: page + route
- [x] `apps/web/src/app/graph/page.tsx` — server component
- [x] `apps/web/src/app/graph/loading.tsx` — skeleton
- [x] Empty state when wiki has 0 pages (matches /wiki empty pattern)

### Phase 4: deps + client component
- [x] `pnpm add -F @llm-wiki/web react-force-graph-3d three` — installed
- [x] `apps/web/src/components/graph/vault-graph.tsx` — 3D scene + side panel
- [x] Dynamic import + `ssr: false` working (no Next webpack changes needed)

### Phase 5: navigation wiring
- [x] Added `Graph` to `PRIMARY_NAV` in `apps/web/src/components/app-header.tsx`
- [ ] Home action card for graph — deferred. Existing 4 cards (Sources, Query, Wiki, Lint) already crowded; nav link is enough.

### Phase 6: polish
- [x] Theme reactivity (MutationObserver watches `<html>` class flips)
- [x] Deep-link camera fly-to (initialSelectedId → 1200ms delay → flyTo to allow force sim to settle)
- [x] Tag chip + type chip on detail panel
- [x] Open page link → `/wiki/<slug>`
- [x] Update `docs/dev-log.md`

### Out of scope / deferred
- [ ] CLI `graph` subcommand printing stats + orphans — nice-to-have, low priority
- [ ] Persistent camera state across visits — V2 polish
- [ ] Search/filter overlay — V2
- [ ] 2D toggle — V2 (`react-force-graph-2d` has near-identical API)

---

## Risks and unknowns

### 1. ESM-only deps and Next 14
`three` and `react-force-graph-3d` are ESM-only. Next 14 *should* handle this with dynamic import + `ssr: false`, but if it complains, we may need `transpilePackages: ['react-force-graph-3d', 'three']` in next.config.mjs. Pre-tested in similar setups; not expecting issues but flagging.

### 2. Bundle bloat
`three` is ~600KB minified+gzipped. We hide this behind dynamic import so only `/graph` pays the cost. First visit to `/graph` will be slower than other routes — acceptable for a visualization route.

### 3. Performance ceiling
`react-force-graph-3d` is smooth up to ~2000 nodes on a typical laptop. The user's quantum-computing wiki has 10 pages — we're 2 orders of magnitude under the ceiling. If anyone scales past 2k, drop `linkDirectionalParticles` and consider clustering.

### 4. Empty wiki UX
Showing an empty 3D scene is depressing. When `nodes.length === 0`, server-render a friendlier empty state ("Add sources and your knowledge graph will start growing here") with a CTA to `/sources`. Match the existing /wiki empty pattern.

### 5. Mobile / narrow viewports
3D graph + WebGL on a phone is not great. V1 we render it anyway and hope the user is on desktop; later we could detect mobile and offer a 2D fallback. Not a blocker.

### 6. Sources type pages
Pages with `type: source` are first-class graph nodes. The /sources page lists *raw inputs* (different concept — items in `raw/`). Don't confuse them in the UI. The graph node label or detail panel should make clear "source-type wiki page" vs "raw source file".

---

## Future enhancements (intentionally out of scope for V1)

- **Search/filter overlay** — type a query, dim non-matching nodes
- **Local mode** — show only nodes within N hops of a focal node (perf win for large vaults)
- **Color by tag** as alternative to color by type (user toggle)
- **2D toggle** (`react-force-graph-2d` has nearly the same API)
- **Persistent camera state** — remember the last camera position when returning to /graph
- **Broken-link visualization** — currently the graph silently drops edges to non-existent slugs. Could draw them dashed red to overlay lint into the same view.
- **Highlight orphans** — toggle to color orphan-degree-0 nodes distinctly
- **Group by frontmatter tag** as a parallel layer to type-based color

---

## Test plan

Manual checklist after Phase 6:

1. **Empty wiki**: spin up against a fresh wiki folder → /graph shows empty-state CTA, no 3D scene.
2. **Existing 10-page wiki**: open /graph → see 10 nodes, links between them, type colors distinct.
3. **Click node**: camera flies to it, side panel slides in, neighbors stay colored, non-neighbors fade.
4. **Click linked-page item in side panel**: camera flies to that node, panel updates.
5. **Click background**: selection clears, side panel disappears, all nodes return to full opacity.
6. **Reload with `?node=peter-shor` in URL**: page loads with peter-shor pre-selected and centered.
7. **Toggle theme (header sun/moon)**: scene background switches to match. Nodes/links stay visible.
8. **Open page from side panel**: navigates to `/wiki/<slug>`.
9. **Run lint, fix an orphan, return to /graph**: graph reflects the new edge.
10. **Add a new source, re-ingest, return to /graph**: new page appears as a node.

Programmatic tests via vitest:
- 5 tests in `packages/core/src/graph.test.ts` (listed in Phase 2).

---

## Decision log

- **2026-05-24** — picked `react-force-graph-3d` over building atop `react-three-fiber`. Same engine Obsidian uses; force simulation included.
- **2026-05-24** — `group` field uses our existing `PageType` enum (concept/entity/comparison/source/overview) rather than free-form tags. Aligns with /wiki's grouping.
- **2026-05-24** — single builder fed from `listPageRows(db) + readPage(wikiPath, slug)` instead of the brief's two-builder (FS + DB) approach. SQLite is FS-synced on every request via `syncWikiToDb` already.
- **2026-05-24** — `/graph` route is top-level (in `PRIMARY_NAV` after `Wiki`), not nested under `/wiki`. It's a peer view of the same data, not a sub-feature.
- **2026-05-24** — URL state via `window.history.replaceState`, not `useRouter().replace()`. Snappy selection without re-rendering the route segment.
- **2026-05-24** — broken `[[slugs]]` are silently dropped from the graph (no orphan edges). Reasoning: the graph view's job is to show structure; lint's job is to surface broken refs. Don't double-report.
