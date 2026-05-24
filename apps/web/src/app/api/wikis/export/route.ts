import { basename } from "node:path";

import archiver from "archiver";

import { resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
// archiver is Node-only (fs + zlib); force the Node runtime so this route
// isn't accidentally picked up by the Edge bundler.
export const runtime = "nodejs";

// GET /api/wikis/export — returns a zip of the active wiki's contents as
// a downloadable attachment. Skips `.llm-wiki/` (regenerable from the rest
// — SQLite, page-history, schema-history, trash all reproducible) so the
// download is portable and minimal.
//
// We buffer the entire zip in memory rather than streaming it. The trade-off:
// memory grows with wiki size, but the response gets a real Content-Length
// (so the browser shows progress + can use a normal download flow instead
// of falling back to "Keep / Resume" UI on a stream of unknown length) and
// we avoid the Node Readable → Web ReadableStream pitfalls in Next 14's
// App Router that produced empty / .txt-typed responses earlier. For a
// V1 personal wiki this is fine; a streaming variant can come back when
// users actually hit memory pressure on hundreds-of-MB wikis.
export async function GET() {
  const wikiPath = resolveWikiPath();
  const folderName = basename(wikiPath) || "llm-wiki";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${folderName}-${stamp}.zip`;

  const archive = archiver("zip", { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  archive.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  archive.on("warning", (err) => {
    // ENOENT during glob walk just means a file disappeared mid-zip —
    // surface anything else.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[export] archiver warning:", err);
    }
  });

  // Walk the wiki folder, exclude .llm-wiki/. archiver.glob handles
  // recursion for us and the ignore pattern works on POSIX + Windows.
  archive.glob("**/*", {
    cwd: wikiPath,
    dot: true, // include .gitignore + .DS_Store-style files if any
    ignore: [".llm-wiki/**", ".llm-wiki"],
  });

  // Wait for archiver to drain. `end` fires after `finalize()` has emitted
  // every chunk; `error` fires on a fatal write failure (which we
  // re-throw as a 500 to the client).
  await new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
    void archive.finalize();
  });

  const body = Buffer.concat(chunks);

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
