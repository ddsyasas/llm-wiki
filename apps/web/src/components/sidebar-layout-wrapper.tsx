"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  /** Aria label for the open-sidebar trigger button (e.g. "Open wiki pages"). */
  triggerLabel: string;
};

// Sidebar shell shared between /wiki and /chats.
//
// Desktop (sm+): sidebar sits side-by-side with content, identical to the
// pre-mobile-fix behavior — the inner sidebar component controls its own
// fixed width.
//
// Mobile (< sm): sidebar becomes an off-canvas drawer. A floating "≡"
// trigger lives in the top-left of the content area; tapping it slides
// the drawer in from the left with a backdrop. Tapping the backdrop OR
// navigating to a new route auto-closes the drawer.
//
// Layout files (wiki/layout.tsx, chats/layout.tsx) are async server
// components (they await requireSetup), so they pass the sidebar as a
// children-shaped prop into this client wrapper — server-side render
// for the gate, client-side state for the drawer.
export function SidebarLayoutWrapper({ sidebar, children, triggerLabel }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Auto-close on route change so picking a page/chat from the drawer
  // immediately reveals it on mobile (the user expects the drawer to
  // get out of the way).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Mobile backdrop. Captures taps to dismiss the drawer. Desktop
          ignores this entirely since the drawer doesn't overlay there. */}
      {open ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close sidebar"
          className="absolute inset-0 z-30 bg-black/40 sm:hidden"
        />
      ) : null}

      {/* Sidebar. On desktop: normal flex item, the inner sidebar's
          fixed width takes over. On mobile: absolute positioning,
          slides in/out via translate.
          `flex` on the wrapper is critical — without it, the inner
          aside's `self-stretch` would no-op (self-stretch requires a
          flex parent) and the sidebar would only be as tall as its
          content, leaving a visible white gap below. */}
      <div
        className={cn(
          "z-40 flex transition-transform duration-200 ease-out",
          // Desktop: in-flow, no transform applied.
          "sm:relative sm:translate-x-0",
          // Mobile: anchored to the wrapper's left edge, full height.
          "absolute inset-y-0 left-0",
          open ? "translate-x-0" : "-translate-x-full sm:translate-x-0",
        )}
      >
        {sidebar}
      </div>

      {/* Content area. min-w-0 so flex children with long text don't
          break the layout. Owns its own scroll.
          The sticky mobile chrome bar sits inside the scroll container
          so position: sticky pins it to the top of the visible area
          — gives mobile users a constant trigger affordance without
          fighting whatever page header is below it. */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur sm:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={triggerLabel}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[12px] hover:bg-accent"
          >
            <span aria-hidden className="font-mono leading-none">≡</span>
            <span>{triggerLabel.replace(/^Open /, "")}</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
