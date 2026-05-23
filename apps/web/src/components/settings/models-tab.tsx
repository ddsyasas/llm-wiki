"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SLOTS = ["ingest", "query", "lint", "vision"] as const;
type Slot = (typeof SLOTS)[number];

const SUGGESTED = [
  { id: "anthropic/claude-3-5-haiku", label: "Claude 3.5 Haiku — fast/cheap" },
  { id: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet — smart, vision" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini — very cheap" },
  { id: "openai/gpt-4o", label: "GPT-4o — smart, vision" },
  { id: "google/gemini-pro-1.5", label: "Gemini Pro 1.5 — long context" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B — open weights" },
];

const SLOT_HINT: Record<Slot, string> = {
  ingest: "Used when adding sources. Bias toward cheap — these calls run often.",
  query: "Used for one-off Q&A. Bias toward smart — answers are user-facing.",
  lint: "Used for the semantic health check.",
  vision: "Used for PDFs and images. Must be a vision-capable model.",
};

type Models = Record<Slot, string>;

export function ModelsTab() {
  const [models, setModels] = useState<Models | null>(null);
  const [original, setOriginal] = useState<Models | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          settings: { defaultModels: Models };
        };
        setModels(data.settings.defaultModels);
        setOriginal(data.settings.defaultModels);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  function update(slot: Slot, value: string) {
    setModels((prev) => (prev ? { ...prev, [slot]: value } : prev));
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
      setFlash("Saved. New operations will use these models.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    !!models &&
    !!original &&
    SLOTS.some((s) => models[s] !== original[s]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Model per operation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Any OpenRouter model ID works. Pick from the suggestions or type a custom slug —
          see{" "}
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            openrouter.ai/models
          </a>{" "}
          for the catalog.
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
        <div className="space-y-4">
          {SLOTS.map((slot) => (
            <div key={slot}>
              <label className="mb-1 block text-sm font-medium capitalize" htmlFor={`m-${slot}`}>
                {slot}
              </label>
              <Input
                id={`m-${slot}`}
                value={models[slot]}
                onChange={(e) => update(slot, e.target.value)}
                list={`presets-${slot}`}
                spellCheck={false}
                className="font-mono text-[13px]"
              />
              <datalist id={`presets-${slot}`}>
                {SUGGESTED.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </datalist>
              <p className="mt-1 text-xs text-muted-foreground">{SLOT_HINT[slot]}</p>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={onSave} disabled={!dirty || busy}>
              {busy ? "Saving…" : dirty ? "Save models" : "Saved"}
            </Button>
            {flash ? <span className="text-sm text-muted-foreground">{flash}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
