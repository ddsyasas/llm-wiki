// The single shell every page lives inside.
//
// Layout: <header /><main>{children}</main><footer />
//
// body already provides `flex min-h-screen flex-col` (root layout), so this
// component is a passthrough that just composes header + main + footer in
// that order. main grows to fill remaining vertical space; pages handle
// their own scroll behavior.

import { AppHeader } from "@/components/app-header";
import { Footer } from "@/components/footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </>
  );
}
