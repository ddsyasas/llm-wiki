"use client";

import Link from "next/link";
import { useState } from "react";

import { AboutTab } from "@/components/settings/about-tab";
import { ApiTab } from "@/components/settings/api-tab";
import { CostsTab } from "@/components/settings/costs-tab";
import { GeneralTab } from "@/components/settings/general-tab";
import { ModelsTab } from "@/components/settings/models-tab";
import { cn } from "@/lib/utils";

type Tab = "general" | "models" | "api" | "costs" | "about";
const TAB_ORDER: Tab[] = ["general", "models", "api", "costs", "about"];
const TAB_LABEL: Record<Tab, string> = {
  general: "General",
  models: "Models",
  api: "API",
  costs: "Costs",
  about: "About",
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/schema" className="hover:text-foreground">
            Schema editor
          </Link>
          <Link href="/" className="hover:text-foreground">
            ← Home
          </Link>
        </div>
      </header>

      <nav
        role="tablist"
        className="mb-6 inline-flex rounded-md border border-border bg-secondary/40 p-1 text-sm"
      >
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-3 py-1",
              tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
        {tab === "general" ? <GeneralTab /> : null}
        {tab === "models" ? <ModelsTab /> : null}
        {tab === "api" ? <ApiTab /> : null}
        {tab === "costs" ? <CostsTab /> : null}
        {tab === "about" ? <AboutTab /> : null}
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        Per-wiki settings live in <code>&lt;wiki&gt;/.llm-wiki/settings.json</code>; the API key
        lives in your OS keychain (or <code>~/.llm-wiki/config.json</code> as fallback).
      </p>
    </main>
  );
}
