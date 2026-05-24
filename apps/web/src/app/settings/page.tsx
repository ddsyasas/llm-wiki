"use client";

import { useState } from "react";

import { PageContainer, PageHeader } from "@/components/page-shell";
import { AboutTab } from "@/components/settings/about-tab";
import { ApiTab } from "@/components/settings/api-tab";
import { CostsTab } from "@/components/settings/costs-tab";
import { GeneralTab } from "@/components/settings/general-tab";
import { ModelsTab } from "@/components/settings/models-tab";
import { WikisTab } from "@/components/settings/wikis-tab";
import { cn } from "@/lib/utils";

type Tab = "general" | "wikis" | "models" | "api" | "costs" | "about";
const TAB_ORDER: Tab[] = ["general", "wikis", "models", "api", "costs", "about"];
const TAB_LABEL: Record<Tab, string> = {
  general: "General",
  wikis: "Wikis",
  models: "Models",
  api: "API",
  costs: "Costs",
  about: "About",
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Per-wiki preferences live in your wiki folder. The API key lives in your OS keychain (or ~/.llm-wiki/config.json as fallback)."
      />

      <nav
        role="tablist"
        className="mb-5 inline-flex rounded-md border border-border/70 bg-secondary/40 p-1 text-ui"
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
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      <section className="rounded-lg border border-border/70 bg-card p-5 text-card-foreground">
        {tab === "general" ? <GeneralTab /> : null}
        {tab === "wikis" ? <WikisTab /> : null}
        {tab === "models" ? <ModelsTab /> : null}
        {tab === "api" ? <ApiTab /> : null}
        {tab === "costs" ? <CostsTab /> : null}
        {tab === "about" ? <AboutTab /> : null}
      </section>
    </PageContainer>
  );
}
