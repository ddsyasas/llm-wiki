"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SLOTS = ["ingest", "query", "lint", "vision"] as const;
type Slot = (typeof SLOTS)[number];

type ModelChoice = {
  id: string;
  label: string;
  notes: string;
  vision: boolean;
};

// Curated dropdown options. Vision slot filters to vision-capable models.
// Users can type a custom slug for anything not listed via CUSTOM_SENTINEL.
const SUGGESTED: ReadonlyArray<ModelChoice> = [
  {
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    notes: "Cheap + fast",
    vision: true,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    notes: "Smart + vision",
    vision: true,
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    notes: "Most capable, pricey",
    vision: true,
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    notes: "Cheapest reliable JSON",
    vision: true,
  },
  { id: "openai/gpt-4o", label: "GPT-4o", notes: "OpenAI smart + vision", vision: true },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    notes: "Long context",
    vision: true,
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    notes: "Cheap + fast Google",
    vision: true,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    notes: "Open weights, no vision",
    vision: false,
  },
];

const CUSTOM_SENTINEL = "__custom__";

const SLOT_HINT: Record<Slot, string> = {
  ingest: "Runs on every source addition. Bias toward cheap — calls add up.",
  query: "One-off Q&A. Bias toward smart — answers are user-facing.",
  lint: "Semantic health check across the wiki. Smart model recommended.",
  vision: "PDFs and images. MUST be vision-capable.",
};

type Models = Record<Slot, string>;

export function ModelsTab() {
  const [models, setModels] = useState<Models | null>(null);
  const [original, setOriginal] = useState<Models | null>(null);
  // Per-slot: is this slot's value currently a custom slug (not in SUGGESTED)?
  const [customMode, setCustomMode] = useState<Record<Slot, boolean>>({
    ingest: false,
    query: false,
    lint: false,
    vision: false,
  });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { settings: { defaultModels: Models } };
        setModels(data.settings.defaultModels);
        setOriginal(data.settings.defaultModels);
        const known = new Set(SUGGESTED.map((s) => s.id));
        setCustomMode({
          ingest: !known.has(data.settings.defaultModels.ingest),
          query: !known.has(data.settings.defaultModels.query),
          lint: !known.has(data.settings.defaultModels.lint),
          vision: !known.has(data.settings.defaultModels.vision),
        });
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  function update(slot: Slot, value: string) {
    setModels((prev) => (prev ? { ...prev, [slot]: value } : prev));
  }

  function onSelectChange(slot: Slot, value: string) {
    if (value === CUSTOM_SENTINEL) {
      setCustomMode((m) => ({ ...m, [slot]: true }));
      return;
    }
    setCustomMode((m) => ({ ...m, [slot]: false }));
    update(slot, value);
  }

  async function onSave() {
    if (!models) return;
    setBusy(true);
    setFlash(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultModels: models }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOriginal(models);
      setFlash("Saved. New operations use these models immediately.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dirty = useMemo(
    () => !!models && !!original && SLOTS.some((s) => models[s] !== original[s]),
    [models, original],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Model per operation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick from curated options or type a custom OpenRouter slug. See{" "}
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            openrouter.ai/models
          </a>{" "}
          for every available model.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!models ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          {SLOTS.map((slot) => {
            const visionOnly = slot === "vision";
            const visibleOptions = visionOnly
              ? SUGGESTED.filter((s) => s.vision)
              : SUGGESTED;
            const known = SUGGESTED.find((s) => s.id === models[slot]);
            const isCustom = customMode[slot] || !known;
            return (
              <div key={slot}>
                <label
                  className="mb-1.5 block text-sm font-medium capitalize"
                  htmlFor={`m-${slot}`}
                >
                  {slot}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    id={`m-${slot}`}
                    value={isCustom ? CUSTOM_SENTINEL : models[slot]}
                    onChange={(e) => onSelectChange(slot, e.target.value)}
                    className={cn(
                      "h-10 min-w-[16rem] rounded-md border border-input bg-background px-3 text-sm",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    )}
                  >
                    {visibleOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {o.notes}
                      </option>
                    ))}
                    <option value={CUSTOM_SENTINEL}>Custom (enter slug below)</option>
                  </select>
                  {isCustom ? (
                    <Input
                      value={models[slot]}
                      onChange={(e) => update(slot, e.target.value)}
                      placeholder="provider/model-id"
                      className="font-mono text-[13px] sm:flex-1"
                    />
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {models[slot]}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{SLOT_HINT[slot]}</p>
              </div>
            );
          })}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={onSave} disabled={!dirty || busy}>
              {busy ? "Saving…" : dirty ? "Save models" : "Saved"}
            </Button>
            {flash ? (
              <span className="text-sm text-muted-foreground">{flash}</span>
            ) : null}
          </div>
        </div>
      )}

      <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Model slugs go stale.</strong> Providers retire
        older versions periodically. If an operation fails with{" "}
        <code className="font-mono">model not available on OpenRouter</code>, switch the
        relevant slot to a current model from the dropdown.
      </div>
    </div>
  );
}
