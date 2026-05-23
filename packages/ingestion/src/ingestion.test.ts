import { describe, expect, it } from "vitest";

import { detectFormat, detectFormatFromUrl } from "./detect";
import { extractMarkdown } from "./markdown";
import { extractPlain } from "./plain";

describe("detectFormat", () => {
  it("infers from extension when no content is given", () => {
    expect(detectFormat("notes.md")).toBe("md");
    expect(detectFormat("paper.pdf")).toBe("pdf");
    expect(detectFormat("deck.pptx")).toBe("pptx");
    expect(detectFormat("photo.jpg")).toBe("image");
    expect(detectFormat("readme.markdown")).toBe("md");
  });

  it("defaults to txt for unknown extensions", () => {
    expect(detectFormat("mystery.qzx")).toBe("txt");
    expect(detectFormat("LICENSE")).toBe("txt");
  });

  it("uses magic bytes to override a lying filename for PDFs and images", () => {
    expect(detectFormat("looks-like.txt", Buffer.from("%PDF-1.4\n"))).toBe("pdf");
    expect(
      detectFormat(
        "lying.txt",
        Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(4)]),
      ),
    ).toBe("image");
  });

  it("falls back to extension when sniffing is inconclusive (zip family)", () => {
    expect(detectFormat("deck.pptx", Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe("pptx");
  });

  it("detectFormatFromUrl handles trailing .pdf and bare URLs", () => {
    expect(detectFormatFromUrl("https://example.com/paper.pdf")).toBe("pdf");
    expect(detectFormatFromUrl("https://example.com/article")).toBe("url");
    expect(detectFormatFromUrl("not a url")).toBe("url");
  });
});

describe("extractPlain", () => {
  it("uses the first non-empty line as title", () => {
    const r = extractPlain(Buffer.from("Hello world\n\nMore stuff\n"));
    expect(r.title).toBe("Hello world");
    expect(r.format).toBe("txt");
    expect(r.content).toContain("More stuff");
  });

  it("strips leading heading markers when deriving a title from content", () => {
    const r = extractPlain(Buffer.from("# My Note\nbody"));
    expect(r.title).toBe("My Note");
  });

  it("prefers a filename-derived title when provided", () => {
    const r = extractPlain(Buffer.from("body\n"), "shors-algorithm.txt");
    expect(r.title).toBe("shors-algorithm");
  });
});

describe("extractMarkdown", () => {
  it("pulls title from frontmatter when present", () => {
    const r = extractMarkdown(
      Buffer.from("---\ntitle: From Frontmatter\n---\n\n# Body H1\n\ntext\n"),
    );
    expect(r.title).toBe("From Frontmatter");
    expect(r.content).toContain("# Body H1");
    expect(r.metadata["title"]).toBe("From Frontmatter");
  });

  it("falls back to the first H1 when frontmatter has no title", () => {
    const r = extractMarkdown(Buffer.from("# The Real Title\n\nintro\n"));
    expect(r.title).toBe("The Real Title");
    expect(r.format).toBe("md");
  });

  it("falls back to the filename stem when neither frontmatter nor H1 exists", () => {
    const r = extractMarkdown(Buffer.from("Just a paragraph.\n"), "my-notes.md");
    // First non-blank line wins over the filename per current behavior; the
    // filename is the final fallback when content is empty.
    expect(r.title).toBe("Just a paragraph.");
    const blank = extractMarkdown(Buffer.from(""), "my-notes.md");
    expect(blank.title).toBe("my-notes");
  });
});
