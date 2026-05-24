// Loading skeletons used by Next App Router loading.tsx files. They render
// instantly when a Link is clicked, before the new route's server render
// completes — without these, the user sees the old page frozen for the
// duration of the navigation, which reads as "did my click register?"

const PULSE = "animate-pulse rounded bg-muted/60";

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
      <div className="mb-10 space-y-3">
        <div className={`${PULSE} h-3 w-28`} />
        <div className={`${PULSE} h-9 w-44`} />
        <div className={`${PULSE} h-4 w-2/3`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/70 bg-card p-5"
          >
            <div className="space-y-3">
              <div className={`${PULSE} h-3 w-20`} />
              <div className={`${PULSE} h-5 w-3/4`} />
              <div className={`${PULSE} h-3 w-full`} />
              <div className={`${PULSE} h-3 w-5/6`} />
              <div className={`${PULSE} h-3 w-1/2`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArticleSkeleton() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 space-y-2 border-b border-border pb-4">
        <div className={`${PULSE} h-9 w-2/3`} />
        <div className={`${PULSE} h-3 w-1/3`} />
      </div>
      <div className="space-y-3">
        <div className={`${PULSE} h-4 w-full`} />
        <div className={`${PULSE} h-4 w-11/12`} />
        <div className={`${PULSE} h-4 w-10/12`} />
        <div className="h-2" />
        <div className={`${PULSE} h-4 w-full`} />
        <div className={`${PULSE} h-4 w-9/12`} />
        <div className={`${PULSE} h-4 w-11/12`} />
      </div>
    </article>
  );
}

export function ListSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10">
      <div className="mb-8 space-y-2">
        <div className={`${PULSE} h-3 w-24`} />
        <div className={`${PULSE} h-9 w-40`} />
        <div className={`${PULSE} h-4 w-2/3`} />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md border border-border/70 bg-card p-4"
          >
            <div className="space-y-2">
              <div className={`${PULSE} h-4 w-1/2`} />
              <div className={`${PULSE} h-3 w-3/4`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className={`${PULSE} h-5 w-40`} />
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className={`${PULSE} h-3 w-24`} />
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="space-y-2">
                <div className={`${PULSE} h-4 w-full`} />
                <div className={`${PULSE} h-4 w-11/12`} />
                <div className={`${PULSE} h-4 w-9/12`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
