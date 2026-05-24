import { basename } from "node:path";
import { PassThrough } from "node:stream";

import archiver from "archiver";

import { resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// GET /api/wikis/export — streams a zip of the active wiki's contents as
// a downloadable attachment. Skips `.llm-wiki/` (regenerable from the rest
// — SQLite, page-history, schema-history, trash all reproducible) so the
// download is portable and minimal.
//
// Streaming because a multi-MB wiki shouldn't be buffered fully in memory.
// `archiver` pipes chunks into a PassThrough that becomes the Response body.
export async function GET() {
  const wikiPath = resolveWikiPath();
  const folderName = basename(wikiPath) || "llm-wiki";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${folderName}-${stamp}.zip`;

  const archive = archiver("zip", { zlib: { level: 6 } });
  const stream = new PassThrough();

  archive.on("error", (err) => {
    // Best-effort: destroy the downstream stream so the client sees the
    // request abort instead of hanging on a partial zip. Logging stays
    // server-side; we don't surface the error to the client because the
    // response headers may already be flushed.
    stream.destroy(err);
  });

  // Walk the wiki folder, exclude .llm-wiki/. archiver.glob handles
  // recursion for us and the ignore pattern works on POSIX + Windows.
  archive.glob("**/*", {
    cwd: wikiPath,
    dot: true, // include .gitignore + .DS_Store-style files if any
    ignore: [".llm-wiki/**", ".llm-wiki"],
  });

  archive.pipe(stream);
  void archive.finalize();

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
