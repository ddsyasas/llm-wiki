"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SLOTS = ["ingest", "query", "chat", "lint", "vision"] as const;
type Slot = (typeof SLOTS)[number];

// ─── Provider types ────────────────────────────────────────────────────────────
type Provider = "openrouter" | "ollama";

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama (Local)" },
];

// ─── OpenRouter model catalogue ────────────────────────────────────────────────
type ModelChoice = {
  id: string;
  label: string;
  notes: string;
  vision: boolean;
};

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

// ─── Ollama local model suggestions ───────────────────────────────────────────
type OllamaChoice = { id: string; label: string; notes: string; vision: boolean };

const OLLAMA_SUGGESTED: ReadonlyArray<OllamaChoice> = [
  { id: "llama3", label: "Llama 3 (8B)", notes: "Meta — fast & capable", vision: false },
  { id: "llama3:70b", label: "Llama 3 (70B)", notes: "Meta — best quality", vision: false },
  { id: "mistral", label: "Mistral 7B", notes: "Great all-rounder", vision: false },
  { id: "mixtral", label: "Mixtral 8x7B", notes: "MoE, strong reasoning", vision: false },
  { id: "phi3", label: "Phi-3 Mini", notes: "Microsoft — tiny + fast", vision: false },
  { id: "phi3:medium", label: "Phi-3 Medium", notes: "Microsoft — balanced", vision: false },
  { id: "gemma2", label: "Gemma 2 (9B)", notes: "Google open model", vision: false },
  { id: "qwen2", label: "Qwen 2 (7B)", notes: "Alibaba — multilingual", vision: false },
  {
    id: "llava",
    label: "LLaVA",
    notes: "Vision-capable local model",
    vision: true,
  },
  {
    id: "moondream",
    label: "Moondream 2",
    notes: "Tiny vision model",
    vision: true,
  },
];

const CUSTOM_SENTINEL = "__custom__";

const SLOT_HINT: Record<Slot, string> = {
  ingest: "Runs on every source addition. Bias toward cheap — calls add up.",
  query: "One-off Q&A. Bias toward smart — answers are user-facing.",
  chat: "Multi-turn conversations. Default for new chats; per-chat override lives in the chat's frontmatter.",
  lint: "Semantic health check across the wiki. Smart model recommended.",
  vision: "PDFs and images. MUST be vision-capable.",
};

// ─── State shape ───────────────────────────────────────────────────────────────
// Mirrors the server's ModelSlotConfig: each slot stores both provider + model.
type SlotConfig = { provider: Provider; model: string };
type Models = Record<Slot, SlotConfig>;

// Shared <select> className to keep all dropdowns visually identical.
const SELECT_CLS = cn(
  "h-10 min-w-[16rem] rounded-md border border-input bg-background px-3 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

export function ModelsTab() {
  const [models, setModels] = useState<Models | null>(null);
  const [original, setOriginal] = useState<Models | null>(null);

  // Per-slot: is this slot's value currently a custom slug (not in the relevant list)?
  const [customMode, setCustomMode] = useState<Record<Slot, boolean>>({
    ingest: false,
    query: false,
    chat: false,
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
        const dm = data.settings.defaultModels;
        setModels(dm);
        setOriginal(dm);

        const knownOR = new Set(SUGGESTED.map((s) => s.id));
        const knownOL = new Set(OLLAMA_SUGGESTED.map((s) => s.id));
        const derivedCustom = {} as Record<Slot, boolean>;
        for (const slot of SLOTS) {
          const { provider, model } = dm[slot];
          derivedCustom[slot] =
            provider === "ollama" ? !knownOL.has(model) : !knownOR.has(model);
        }
        setCustomMode(derivedCustom);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, []);

  function updateSlot(slot: Slot, patch: Partial<SlotConfig>) {
    setModels((prev) => (prev ? { ...prev, [slot]: { ...prev[slot], ...patch } } : prev));
  }

  function onProviderChange(slot: Slot, value: Provider) {
    setCustomMode((m) => ({ ...m, [slot]: false }));
    // Reset model to a sensible default for the new provider
    const defaultModel =
      value === "ollama"
        ? (OLLAMA_SUGGESTED.find((m) => (slot === "vision" ? m.vision : true))?.id ?? "llama3")
        : (SUGGESTED.find((s) => (slot === "vision" ? s.vision : true))?.id ?? SUGGESTED[0]?.id ?? "openai/gpt-4o-mini");
    updateSlot(slot, { provider: value, model: defaultModel });
  }

  function onModelSelectChange(slot: Slot, value: string) {
    if (value === CUSTOM_SENTINEL) {
      setCustomMode((m) => ({ ...m, [slot]: true }));
      updateSlot(slot, { model: "" });
      return;
    }
    setCustomMode((m) => ({ ...m, [slot]: false }));
    updateSlot(slot, { model: value });
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
    () => !!models && !!original && SLOTS.some((s) => {
      return models[s].provider !== original[s].provider || models[s].model !== original[s].model;
    }),
    [models, original],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Model per operation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a provider and model for each operation. Use{" "}
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            OpenRouter
          </a>{" "}
          for cloud models or{" "}
          <a
            href="https://ollama.com/library"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Ollama
          </a>{" "}
          for local inference.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {!models ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          {SLOTS.map((slot) => {
            const provider = models[slot].provider;
            const visionOnly = slot === "vision";
            const isOllama = provider === "ollama";

            // Pick which suggestion list to show
            const visibleOptions = isOllama
              ? visionOnly
                ? OLLAMA_SUGGESTED.filter((s) => s.vision)
                : OLLAMA_SUGGESTED
              : visionOnly
                ? SUGGESTED.filter((s) => s.vision)
                : SUGGESTED;

            const knownIds = new Set(visibleOptions.map((o) => o.id));
            const isCustom = customMode[slot] || !knownIds.has(models[slot].model);

            return (
              <div key={slot}>
                <label className="mb-1.5 block text-sm font-medium capitalize" htmlFor={`m-${slot}`}>
                  {slot}
                </label>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {/* ── Provider picker ─────────────────────────────────── */}
                  <select
                    id={`p-${slot}`}
                    aria-label={`${slot} provider`}
                    value={provider}
                    onChange={(e) => onProviderChange(slot, e.target.value as Provider)}
                    className={cn(SELECT_CLS, "min-w-[10rem]")}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>

                  {/* ── Model picker ────────────────────────────────────── */}
                  <select
                    id={`m-${slot}`}
                    value={isCustom ? CUSTOM_SENTINEL : models[slot].model}
                    onChange={(e) => onModelSelectChange(slot, e.target.value)}
                    className={cn(SELECT_CLS, "min-w-[16rem]")}
                  >
                    {visibleOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label} — {o.notes}
                      </option>
                    ))}
                    <option value={CUSTOM_SENTINEL}>
                      {isOllama ? "Custom (enter model name below)" : "Custom (enter slug below)"}
                    </option>
                  </select>

                  {/* ── Custom model input ──────────────────────────────── */}
                  {isCustom ? (
                    <Input
                      value={models[slot].model}
                      onChange={(e) => updateSlot(slot, { model: e.target.value })}
                      placeholder={isOllama ? "e.g. llama3:latest" : "provider/model-id"}
                      className="font-mono text-[13px] sm:flex-1"
                    />
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">{models[slot].model}</span>
                  )}
                </div>

                {/* Ollama hint */}
                {isOllama && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Make sure{" "}
                    <code className="font-mono">ollama run {models[slot].model || "<model>"}</code> works
                    locally before saving.
                  </p>
                )}

                <p className="mt-1 text-xs text-muted-foreground">{SLOT_HINT[slot]}</p>
              </div>
            );
          })}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={onSave} disabled={!dirty || busy}>
              {busy ? "Saving…" : dirty ? "Save models" : "Saved"}
            </Button>
            {flash ? <span className="text-sm text-muted-foreground">{flash}</span> : null}
          </div>
        </div>
      )}

      <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Model slugs go stale.</strong> Providers retire older
        versions periodically. If an operation fails with{" "}
        <code className="font-mono">model not available on OpenRouter</code>, switch the relevant
        slot to a current model from the dropdown. For Ollama, run{" "}
        <code className="font-mono">ollama list</code> to see locally installed models.
      </div>
    </div>
  );
}
