import { ChatsSidebar } from "@/components/chats/sidebar";
import { requireSetup } from "@/lib/server-wiki";

// Sidebar (left) + content (right) split. See wiki/layout.tsx for the
// flex-stretch reasoning — same shape here. Same requireSetup() gate too.
export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  await requireSetup();
  return (
    <div className="flex flex-1 overflow-hidden">
      <ChatsSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
