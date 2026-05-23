import { ChatsSidebar } from "@/components/chats/sidebar";

// Sidebar (left) + content (right) split. See wiki/layout.tsx for the
// flex-stretch reasoning — same shape here.
export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <ChatsSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
