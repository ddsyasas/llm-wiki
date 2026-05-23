import { WikiSidebar } from "@/components/wiki/sidebar";

// Sidebar (left) + content (right) split. flex-1 grows to fill main's height,
// overflow-hidden locks the row so sidebar can stretch naturally (flex default
// align-items: stretch) and the content area owns its own scroll.
export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <WikiSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
