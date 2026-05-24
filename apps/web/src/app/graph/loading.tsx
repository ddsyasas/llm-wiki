// Loading state for /graph. The 3D scene + Three.js bundle dynamic-imports
// after this renders, so the user sees something the moment the route
// commits instead of staring at a frozen previous page.

export default function Loading() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-background">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-full border-2 border-border bg-muted/40" />
        <p className="text-caption uppercase tracking-[0.18em] text-muted-foreground">
          Loading graph
        </p>
      </div>
    </div>
  );
}
