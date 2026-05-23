import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

// We preprocess [[slug]] / [[slug|Display]] into ordinary markdown links with a
// `#wikilink:slug` href so react-markdown emits them as <a>. The custom link
// renderer below converts that prefix into a Next.js <Link>.
const WIKILINK_RE = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
const WIKILINK_PREFIX = "#wikilink:";

function preprocessWikiLinks(md: string): string {
  return md.replace(WIKILINK_RE, (_, slug: string, label?: string) => {
    const display = (label && label.trim()) || slug;
    // Escape closing bracket in display to avoid breaking the link syntax.
    const safeDisplay = display.replace(/]/g, "\\]");
    return `[${safeDisplay}](${WIKILINK_PREFIX}${slug})`;
  });
}

export type MarkdownViewProps = {
  content: string;
  /** All slugs known to exist. Wikilinks to unknown slugs render strikethrough. */
  knownSlugs: ReadonlyArray<string>;
  className?: string;
};

export function MarkdownView({ content, knownSlugs, className }: MarkdownViewProps) {
  const knownSet = new Set(knownSlugs);
  const processed = preprocessWikiLinks(content);

  return (
    <div
      className={cn(
        "prose prose-stone max-w-none dark:prose-invert",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-a:text-primary prose-a:underline-offset-2",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-[''] prose-code:after:content-['']",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => {
            if (href && href.startsWith(WIKILINK_PREFIX)) {
              const slug = href.slice(WIKILINK_PREFIX.length);
              const exists = knownSet.has(slug);
              const className = exists
                ? "text-primary underline underline-offset-2 hover:text-primary/80"
                : "text-muted-foreground line-through decoration-1 hover:text-foreground";
              return (
                <Link
                  href={`/wiki/${slug}`}
                  className={className}
                  title={exists ? `→ ${slug}` : `Page "${slug}" doesn't exist yet`}
                >
                  {children}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                {children}
              </a>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
