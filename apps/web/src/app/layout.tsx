import type { Metadata } from "next";
import { Crimson_Pro, Fraunces, Inter, JetBrains_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

// Loaded via next/font so they're hashed, preloaded, and CLS-free. The CSS
// vars below get bound to Tailwind's font-sans / font-serif / font-display /
// font-mono in tailwind.config.ts.
const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const fontSerif = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600"],
});
const fontDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LLM Wiki",
  description: "Local-first knowledge base maintained by an LLM agent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontSerif.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <head>
        {/* Runs before hydration to avoid a light->dark flash on first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex h-screen flex-col overflow-hidden">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <CommandPalette />
        </ThemeProvider>
      </body>
    </html>
  );
}
