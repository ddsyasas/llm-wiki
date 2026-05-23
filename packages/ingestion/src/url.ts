import { extractHtml } from "./html";
import type { ExtractedTextSource } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (compatible; LLM-Wiki/0.1; +https://github.com/ddsyasas/llm-wiki)";

export type FetchUrlOptions = {
  /** Override the default timeout (ms). */
  timeoutMs?: number;
};

/**
 * Fetches a URL and runs the response body through the HTML extractor.
 *
 * - Follows redirects (Node's fetch does this by default).
 * - Aborts after a configurable timeout so a slow site can't hang the route.
 * - Throws a typed Error with a `code` property on transport failures so the
 *   route can surface a clean message to the user.
 */
export async function fetchAndExtractUrl(
  url: string,
  opts: FetchUrlOptions = {},
): Promise<ExtractedTextSource> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = new Error(`could not fetch ${url}: ${(err as Error).message}`);
    (e as Error & { code?: string }).code = "FETCH_FAILED";
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const e = new Error(`URL returned HTTP ${response.status}`);
    (e as Error & { code?: string }).code = "HTTP_ERROR";
    throw e;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("text/plain")) {
    const e = new Error(`unsupported content-type for URL fetch: ${contentType || "(none)"}`);
    (e as Error & { code?: string }).code = "UNSUPPORTED_CONTENT_TYPE";
    throw e;
  }

  const buf = Buffer.from(await response.arrayBuffer());
  return extractHtml(buf, { url, format: "url" });
}
