import { WikiSidebar } from "@/components/wiki/sidebar";
import { requireSetup } from "@/lib/server-wiki";

// Sidebar (left) + content (right) split. flex-1 grows to fill main's height,
// overflow-hidden locks the row so sidebar can stretch naturally (flex default
// align-items: stretch) and the content area owns its own scroll.
//
// Layout-level requireSetup() gate catches direct-bookmark hits to /wiki and
// /wiki/<slug> when the user hasn't completed the welcome wizard yet.
// Same pattern in chats/layout.tsx and each protected page below.
export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  await requireSetup();
  return (
    <div className="flex flex-1 overflow-hidden">
      <WikiSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
