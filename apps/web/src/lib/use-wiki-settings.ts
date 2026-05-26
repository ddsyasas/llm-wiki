"use client";

import { useEffect, useState } from "react";

export type ModelSlot = {
  provider: string;
  model: string;
};

export type WikiSettingsPayload = {
  settings: {
    topic: string;
    defaultModels: {
      ingest: ModelSlot;
      query: ModelSlot;
      chat: ModelSlot;
      lint: ModelSlot;
      vision: ModelSlot;
    };
    autoLintAfterIngest: boolean;
    showCostEstimates: boolean;
    requireApprovalForIngest: boolean;
  };
  wikiPath: string;
};

/**
 * Client hook to load /api/settings once on mount. Returns null while loading
 * and on error (silent — cost preview just hides). Cached per page render only;
 * navigation refetches.
 */
export function useWikiSettings(): WikiSettingsPayload | null {
  const [data, setData] = useState<WikiSettingsPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as WikiSettingsPayload;
        if (!cancelled) setData(json);
      } catch {
        // ignore — caller handles the null state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}
