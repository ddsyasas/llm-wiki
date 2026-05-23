import { WikiSidebar } from "@/components/wiki/sidebar";

// AppShell provides the header + footer. For wiki pages we split horizontally:
// sidebar | content. The explicit calc() height locks the split to the
// viewport (minus header + footer) so the sidebar fills cleanly instead of
// collapsing to its content height.
//
// 3.5rem = h-14 sticky header. 2.25rem = footer (py-2 + 11px text).
export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-3.5rem-2.25rem)] flex-1">
      <WikiSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
