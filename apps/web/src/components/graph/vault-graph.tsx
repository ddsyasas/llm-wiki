"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphData, GraphLink, GraphNode } from "@llm-wiki/core";

// react-force-graph-3d is ESM + heavy (pulls in three.js, ~600KB gzipped).
// Dynamic import + ssr:false so it never lands in any other route's bundle
// and SSR doesn't try to render WebGL.
const ForceGraph3D = dynamic(
  () => import("react-force-graph-3d").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 grid place-items-center bg-background text-caption uppercase tracking-[0.18em] text-muted-foreground">
        Initializing 3D scene…
      </div>
    ),
  },
);

type Props = {
  data: GraphData;
  initialSelectedId?: string;
};

// Restrained palette per docs/12 §"Page color → type mapping". Distinct
// enough for at-a-glance grouping; chosen to read in both light + dark mode
// since the 3D scene background flips with the theme.
const TYPE_COLOR: Record<string, string> = {
  overview: "#dc2626",
  concept: "#0891b2",
  entity: "#d97706",
  comparison: "#7c3aed",
  source: "#64748b",
};
const TYPE_COLOR_DEFAULT = "#94a3b8";

const TYPE_LABEL: Record<string, string> = {
  overview: "Overview",
  concept: "Concept",
  entity: "Entity",
  comparison: "Comparison",
  source: "Source",
};

function colorForType(group?: string): string {
  if (!group) return TYPE_COLOR_DEFAULT;
  return TYPE_COLOR[group] ?? TYPE_COLOR_DEFAULT;
}

// react-force-graph mutates GraphNode-shaped objects with x/y/z and replaces
// link.source / link.target with the node references during simulation. The
// library's exported types are overconstrained vs. what it actually passes
// to accessors, so we use loose runtime checks here instead of fighting them.
type AnyNode = GraphNode & { x?: number; y?: number; z?: number };

function linkEndpointId(end: unknown): string {
  if (typeof end === "string") return end;
  if (end && typeof end === "object" && "id" in end) {
    return String((end as { id: unknown }).id);
  }
  return "";
}

export function VaultGraph({ data, initialSelectedId }: Props) {
  // Loose ref typing — the library's generic ref type is awkward and we only
  // use it for the cameraPosition method.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selectedId, setSelectedIdState] = useState<string | undefined>(
    initialSelectedId,
  );
  const [bgColor, setBgColor] = useState("#faf7f2");

  // Read --background CSS var so the WebGL canvas matches the page bg, and
  // watch for theme class flips on <html> from our homegrown ThemeProvider.
  useEffect(() => {
    const read = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--background")
        .trim();
      if (raw) setBgColor(`hsl(${raw})`);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Track the container size for the 3D scene. The library wants explicit
  // width/height props — without a ResizeObserver the canvas stretches
  // weirdly on window resize.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // URL state without a router round-trip. The page's server component reads
  // ?node= and passes initialSelectedId, so deep links work; while on the
  // page, every click updates the URL via replaceState to keep selection
  // snappy without triggering a re-render of the route segment.
  const setSelectedId = useCallback((id: string | undefined) => {
    setSelectedIdState(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("node", id);
    else url.searchParams.delete("node");
    window.history.replaceState(null, "", url.toString());
  }, []);

  // Adjacency lookup so we can dim/highlight neighbors of the selected node.
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of data.nodes) map.set(n.id, new Set());
    for (const link of data.links) {
      const s = linkEndpointId(link.source);
      const t = linkEndpointId(link.target);
      map.get(s)?.add(t);
      map.get(t)?.add(s);
    }
    return map;
  }, [data]);

  const selected = useMemo(
    () => data.nodes.find((n) => n.id === selectedId) ?? null,
    [data, selectedId],
  );
  const linkedIds = selected ? neighbors.get(selected.id) ?? new Set<string>() : null;
  const linkedNodes = useMemo(() => {
    if (!linkedIds) return [];
    return data.nodes.filter((n) => linkedIds.has(n.id));
  }, [linkedIds, data]);

  // Fly the camera to a node — distance scales with the node's position so
  // small/dense graphs and sparse ones both center nicely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function flyTo(node: any) {
    const distance = 110;
    const dist = Math.hypot(node.x ?? 1, node.y ?? 1, node.z ?? 1) || 1;
    const ratio = 1 + distance / dist;
    fgRef.current?.cameraPosition(
      { x: (node.x ?? 0) * ratio, y: (node.y ?? 0) * ratio, z: (node.z ?? 0) * ratio },
      node,
      900,
    );
  }

  // Initial fly-to when ?node=<slug> was in the URL on page load. We wait a
  // bit so the force simulation has positioned the nodes.
  useEffect(() => {
    if (!initialSelectedId) return;
    const t = setTimeout(() => {
      const node = (data.nodes as AnyNode[]).find((n) => n.id === initialSelectedId);
      if (node && node.x !== undefined) flyTo(node);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleNodeClick(node: any) {
    flyTo(node);
    setSelectedId(node.id);
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-background text-foreground"
      // The graph layout uses fixed positioning to fill the viewport
      // beneath the header. top-14 accounts for the 56px header.
      style={{ top: "3.5rem", bottom: "2.5rem" }}
    >
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        width={size.w || undefined}
        height={size.h || undefined}
        backgroundColor={bgColor}
        nodeLabel={(n: object) => {
          const node = n as GraphNode;
          return `<div style="background:#1c1917;color:#fafaf9;padding:6px 9px;border-radius:6px;font:500 12px/1.3 ui-sans-serif,system-ui;">${escapeHtml(
            node.title,
          )}<div style="opacity:.65;font-size:10px;margin-top:2px;">${escapeHtml(
            TYPE_LABEL[node.group] ?? node.group,
          )} · ${node.degree} link${node.degree === 1 ? "" : "s"}</div></div>`;
        }}
        nodeRelSize={5}
        nodeVal={(n: object) => 1 + Math.sqrt((n as GraphNode).degree ?? 0) * 2}
        nodeColor={(n: object) => {
          const node = n as GraphNode;
          if (!selected) return colorForType(node.group);
          if (node.id === selected.id) return "#fafaf9";
          if (linkedIds?.has(node.id)) return colorForType(node.group);
          return "rgba(120, 120, 130, 0.22)";
        }}
        nodeOpacity={0.95}
        linkColor={(l: object) => {
          if (!selected) return "rgba(120, 120, 130, 0.35)";
          const link = l as { source: unknown; target: unknown };
          const s = linkEndpointId(link.source);
          const t = linkEndpointId(link.target);
          return s === selected.id || t === selected.id
            ? "rgba(220, 38, 38, 0.75)"
            : "rgba(120, 120, 130, 0.08)";
        }}
        linkWidth={(l: object) => {
          if (!selected) return 0.6;
          const link = l as { source: unknown; target: unknown };
          const s = linkEndpointId(link.source);
          const t = linkEndpointId(link.target);
          return s === selected.id || t === selected.id ? 1.8 : 0.4;
        }}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.4}
        linkDirectionalParticleSpeed={0.004}
        onNodeClick={(n: object) => handleNodeClick(n)}
        onBackgroundClick={() => setSelectedId(undefined)}
      />

      {/* Stats / legend — top-left, glass background so it sits over the
          scene without competing for attention. */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 max-w-xs rounded-lg border border-border/60 bg-card/75 p-4 shadow-sm backdrop-blur-md">
        <p className="text-caption font-semibold uppercase tracking-wider text-primary">
          Knowledge graph
        </p>
        <p className="mt-1 text-ui text-foreground">
          {data.nodes.length} page{data.nodes.length === 1 ? "" : "s"} ·{" "}
          {data.links.length} link{data.links.length === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-caption text-muted-foreground">
          Drag to orbit · scroll to zoom · click a node
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["overview", "concept", "entity", "comparison", "source"] as const)
            .filter((t) => data.nodes.some((n) => n.group === t))
            .map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorForType(t) }}
                />
                {t}
              </span>
            ))}
        </div>
      </div>

      {/* Side panel — top-right, only when a node is selected. */}
      {selected ? (
        <div className="absolute right-5 top-5 z-10 max-h-[calc(100vh-8rem)] w-[320px] overflow-y-auto rounded-lg border border-border/60 bg-card/85 p-4 shadow-sm backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
              style={{
                backgroundColor: `${colorForType(selected.group)}22`,
                color: colorForType(selected.group),
              }}
            >
              {TYPE_LABEL[selected.group] ?? selected.group}
            </span>
            <button
              type="button"
              onClick={() => setSelectedId(undefined)}
              className="rounded p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              aria-label="Close"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
          <h2 className="font-display text-h3 font-semibold tracking-tight">
            {selected.title}
          </h2>
          <p className="mt-1 text-caption text-muted-foreground">
            {selected.degree} link{selected.degree === 1 ? "" : "s"}
            {selected.tags.length > 0 ? ` · ${selected.tags.join(", ")}` : null}
          </p>
          {selected.preview ? (
            <p className="mt-3 text-ui leading-relaxed text-foreground/85">
              {selected.preview}
            </p>
          ) : null}
          {linkedNodes.length > 0 ? (
            <div className="mt-4">
              <p className="text-caption uppercase tracking-wider text-muted-foreground">
                Connected ({linkedNodes.length})
              </p>
              <ul className="mt-1 divide-y divide-border/50">
                {linkedNodes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const node = (data.nodes as AnyNode[]).find(
                          (x) => x.id === n.id,
                        );
                        if (node) handleNodeClick(node);
                      }}
                      className="flex w-full items-baseline gap-2 py-1.5 text-left hover:text-primary"
                    >
                      <span
                        aria-hidden
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorForType(n.group) }}
                      />
                      <span className="text-ui">{n.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link
            href={`/wiki/${selected.id}`}
            className="mt-4 block rounded-md border border-primary/40 bg-primary/[0.06] px-3 py-2 text-center text-ui text-primary hover:bg-primary/10"
          >
            Open page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
