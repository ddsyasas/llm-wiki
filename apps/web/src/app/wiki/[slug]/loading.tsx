// Click a card on /wiki → this skeleton renders instantly while the
// per-page server component fetches frontmatter + backlinks + content.

import { ArticleSkeleton } from "@/components/loading-skeleton";

export default function Loading() {
  return <ArticleSkeleton />;
}
