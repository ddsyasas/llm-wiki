"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiKeyStatus = {
  configured: boolean;
  source: "keychain" | "config" | "none";
  keychainAvailable: boolean;
  hint: string | null;
};

type TestResult =
  | { ok: true; label: string | null; usageUsd: number; limitUsd: number | null }
  | { ok: false; reason: string; message: string };

// "view" = key is set, showing a masked read-only display
// "edit" = entering a new key (either first-time paste or replace flow)
type Mode = "view" | "edit";

export function ApiTab() {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("edit");
  const [busy, setBusy] = useState<"save" | "delete" | "test" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  // Whenever status changes, default to the right mode: view if key set, edit
  // if not. The user explicitly clicking Replace flips us back to edit.
  useEffect(() => {
    if (status?.configured) setMode("view");
    else setMode("edit");
  }, [status?.configured]);

  async function refresh() {
    setLoadError(null);
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      if (!res.ok) throw new Error(`/api/config returned ${res.status}`);
      const json = (await res.json()) as ApiKeyStatus;
      setStatus(json);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy("save");
    setFlash(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: draft.trim() }),
      });
      const json = (await res.json()) as ApiKeyStatus | { error: string };
      if (!res.ok) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      setStatus(json as ApiKeyStatus);
      setDraft("");
      setMode("view");
      setFlash(
        `Saved to ${(json as ApiKeyStatus).source === "keychain" ? "OS keychain" : "config file"}.`,
      );
    } catch (err) {
      setFlash(`Could not save: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm("Remove the saved OpenRouter API key?")) return;
    setBusy("delete");
    setFlash(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/config", { method: "DELETE" });
      const json = (await res.json()) as ApiKeyStatus | { error: string };
      if (!res.ok) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      setStatus(json as ApiKeyStatus);
      setMode("edit");
      setFlash("API key removed.");
    } catch (err) {
      setFlash(`Could not delete: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy("test");
    setTestResult(null);
    try {
      const res = await fetch("/api/config/test", { method: "POST" });
      const json = (await res.json()) as TestResult;
      setTestResult(json);
    } catch (err) {
      setTestResult({ ok: false, reason: "network", message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function maskedKey(hint: string | null): string {
    // 8 leading chars + 16 dots + last 4. Looks like a real key, hides the
    // actual middle. We don't store the raw key client-side so we reconstruct
    // a representative shape using "sk-or-v1-" as the known prefix.
    const prefix = "sk-or-v1-";
    const dots = "•".repeat(16);
    return hint ? `${prefix}${dots}${hint}` : `${prefix}${dots}••••`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-medium">OpenRouter API key</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stored in the OS keychain when available, otherwise in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.llm-wiki/config.json</code>{" "}
          with 0600 permissions. Get a key at{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
          >
            openrouter.ai/keys
          </a>
          .
        </p>
      </div>

      {loadError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : status === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : mode === "view" && status.configured ? (
        // ---- view mode: masked key, default actions ----------------------
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Current key</label>
            <div className="flex items-stretch gap-2">
              <div
                className="flex h-10 flex-1 select-none items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-sm text-foreground/80"
                aria-label="Saved API key (masked)"
              >
                {maskedKey(status.hint)}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft("");
                  setMode("edit");
                  setFlash(null);
                  setTestResult(null);
                }}
              >
                Replace
              </Button>
            </div>
            <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Stored in {status.source === "keychain" ? "your OS keychain" : "config file"}
              {status.hint ? (
                <>
                  , ending in <code>…{status.hint}</code>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onTest} disabled={busy !== null}>
              {busy === "test" ? "Testing…" : "Test connection"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDelete} disabled={busy !== null}>
              {busy === "delete" ? "Removing…" : "Remove"}
            </Button>
          </div>
        </div>
      ) : (
        // ---- edit mode: input new key ------------------------------------
        <form onSubmit={onSave} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="api-key">
              {status.configured ? "New key" : "Paste your key"}
            </label>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-v1-..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="font-mono"
            />
            {!status.keychainAvailable ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Note: OS keychain isn&apos;t available on this system. The key will be saved to a
                permissions-restricted file in your home directory.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!draft.trim() || busy !== null}>
              {busy === "save" ? "Saving…" : "Save key"}
            </Button>
            {status.configured ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft("");
                  setMode("view");
                  setFlash(null);
                }}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}

      {flash ? <p className="text-sm text-muted-foreground">{flash}</p> : null}

      {testResult ? (
        <div
          className={
            "rounded-md px-3 py-2 text-sm " +
            (testResult.ok
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-destructive/10 text-destructive")
          }
        >
          {testResult.ok ? (
            <span>
              Key works.
              {testResult.label ? (
                <>
                  {" "}
                  Account: <strong>{testResult.label}</strong>.
                </>
              ) : null}{" "}
              {testResult.limitUsd !== null
                ? `Used $${testResult.usageUsd.toFixed(2)} of $${testResult.limitUsd.toFixed(2)}.`
                : `Lifetime usage $${testResult.usageUsd.toFixed(2)}.`}
            </span>
          ) : (
            <span>{testResult.message}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
