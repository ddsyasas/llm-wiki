import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import TurndownService from "turndown";

import type { ExtractedTextSource, SourceFormat } from "./types";

export type ExtractHtmlOptions = {
  /** Original URL, if known — used as the base for relative links. */
  url?: string;
  /** Force the format label. Defaults to "html" or "url" depending on whether url is given. */
  format?: SourceFormat;
};

export function extractHtml(buffer: Buffer, opts: ExtractHtmlOptions = {}): ExtractedTextSource {
  const html = buffer.toString("utf8");
  return parseHtmlString(html, opts);
}

function parseHtmlString(html: string, opts: ExtractHtmlOptions): ExtractedTextSource {
  // jsdom logs CSS parse errors to console by default — suppress so they don't
  // spam the dev console for every fetched page.
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: opts.url ?? "http://localhost/",
    virtualConsole,
  });

  // Readability mutates the DOM, so clone-via-clone-node when we still want
  // <title> later. Easiest: pull <title> out first.
  const rawTitle = dom.window.document.title?.trim() ?? "";

  let extractedHtml = "";
  let articleTitle = "";
  let byline = "";
  let siteName = "";

  try {
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article) {
      extractedHtml = article.content ?? "";
      articleTitle = article.title?.trim() ?? "";
      byline = article.byline?.trim() ?? "";
      siteName = article.siteName?.trim() ?? "";
    }
  } catch {
    // Readability throws on weird inputs (e.g., empty bodies). Fall through.
  }

  if (!extractedHtml) {
    // Readability gave up — keep the original <body> as a fallback so we
    // still produce something the LLM can read.
    extractedHtml = dom.window.document.body?.innerHTML ?? html;
  }

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    bulletListMarker: "-",
    linkStyle: "inlined",
  });
  // Drop obvious junk that survives Readability.
  turndown.remove(["script", "style", "noscript", "iframe"]);

  const markdown = turndown.turndown(extractedHtml).trim();

  const finalTitle = articleTitle || rawTitle || deriveTitleFromUrl(opts.url) || "Untitled";

  const meta: Record<string, unknown> = {};
  if (byline) meta["byline"] = byline;
  if (siteName) meta["siteName"] = siteName;
  if (opts.url) meta["sourceUrl"] = opts.url;

  return {
    kind: "text",
    title: finalTitle,
    content: markdown,
    format: opts.format ?? (opts.url ? "url" : "html"),
    metadata: meta,
  };
}

function deriveTitleFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.replace(/\/$/, "");
  } catch {
    return null;
  }
}
