export type PageType = "entity" | "concept" | "source" | "comparison" | "overview";

export const PAGE_TYPES: readonly PageType[] = [
  "entity",
  "concept",
  "source",
  "comparison",
  "overview",
] as const;

export type PageFrontmatter = {
  title: string;
  slug: string;
  type: PageType;
  created: string;
  updated: string;
  sources?: string[];
  tags?: string[];
};

export type Page = {
  slug: string;
  frontmatter: PageFrontmatter;
  content: string;
};

export type PageSummary = {
  slug: string;
  title: string;
  type: PageType;
  updated: string;
};
