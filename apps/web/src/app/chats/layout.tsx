import { ChatsSidebar } from "@/components/chats/sidebar";

// AppShell provides the header + footer. We only add the contextual sidebar
// + content split for chats pages.
export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <ChatsSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
