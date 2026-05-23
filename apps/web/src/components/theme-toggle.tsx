"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type UiTheme } from "@/components/theme-provider";

const ORDER: UiTheme[] = ["light", "dark", "auto"];
const LABEL: Record<UiTheme, string> = {
  light: "Switch to dark theme",
  dark: "Switch to auto (follow system)",
  auto: "Switch to light theme",
};

// Cycles light → dark → auto → light. Single click target so it stays out
// of the way; the Settings → General tab has the explicit 3-way picker for
// users who'd rather not cycle.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function next() {
    const i = ORDER.indexOf(theme);
    const upcoming = ORDER[(i + 1) % ORDER.length] ?? "auto";
    setTheme(upcoming);
  }

  return (
    <button
      type="button"
      onClick={next}
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {theme === "light" ? (
        <Sun className="h-4 w-4" />
      ) : theme === "dark" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Monitor className="h-4 w-4" />
      )}
    </button>
  );
}
