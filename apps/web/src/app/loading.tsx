// Root-level Suspense fallback. Fires for any route that doesn't have its
// own loading.tsx. Keeps the user from staring at a frozen old page while
// the next route compiles + server-renders.

import { PageSkeleton } from "@/components/loading-skeleton";

export default function Loading() {
  return <PageSkeleton />;
}
