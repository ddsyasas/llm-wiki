import { WikiSidebar } from "@/components/wiki/sidebar";

// AppShell provides the header + footer. We only add the contextual sidebar
// + content split for wiki pages.
export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <WikiSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
