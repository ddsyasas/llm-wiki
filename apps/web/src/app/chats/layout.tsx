import { ChatsSidebar } from "@/components/chats/sidebar";
import { SidebarLayoutWrapper } from "@/components/sidebar-layout-wrapper";
import { requireSetup } from "@/lib/server-wiki";

// Sidebar (left) + content (right) split. See wiki/layout.tsx — same shape,
// same off-canvas drawer on mobile, same requireSetup() gate.
export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  await requireSetup("chat");
  return (
    <SidebarLayoutWrapper sidebar={<ChatsSidebar />} triggerLabel="Open chats list">
      {children}
    </SidebarLayoutWrapper>
  );
}
