// The single shell every page lives inside.
//
// Layout: <header /><main><sidebar?/><content/></main><footer />
//
// Pages that need a contextual sidebar (Wiki, Chats) register one via the
// SidebarSlot context exposed below. Their layout files render <SidebarSlot>
// at the top, and AppShell picks it up on the next render. This avoids
// having each page wrap itself in repetitive chrome.

import { AppHeader } from "@/components/app-header";
import { Footer } from "@/components/footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  );
}
