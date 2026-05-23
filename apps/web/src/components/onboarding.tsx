"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  needsTopic: boolean;
  needsKey: boolean;
  initialTopic: string;
  wikiPath: string;
};

// First-run gate. Renders on / when getApiKey() returns null or when
// settings.topic is empty. Per docs/04 P0 #1: "First-run wizard if folder
// isn't initialized" and "API key setup wizard if no key configured."
//
// Single-screen by design — the docs/08 three-step modal flow is overkill for
// the two things we actually need to collect. One card, two fields, one save.
export function Onboarding({ needsTopic, needsKey, initialTopic, wikiPath }: Props) {
  const router = useRouter();
  const [topic, setTopic] = useState(initialTopic);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const canSubmit =
    (!needsTopic || topic.trim().length > 0) &&
    (!needsKey || key.trim().length > 0) &&
    !busy;

  async function onTest() {
    if (!key.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestMessage(null);
    try {
      const res = await fetch("/api/config/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        setTestResult("ok");
        setTestMessage("Key works — OpenRouter responded.");
      } else {
        setTestResult("fail");
        setTestMessage(json.error ?? "Test failed.");
      }
    } catch (err) {
      setTestResult("fail");
      setTestMessage((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      if (needsTopic && topic.trim()) {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic: topic.trim() }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `topic save failed: HTTP ${res.status}`);
        }
      }
      if (needsKey && key.trim()) {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: key.trim() }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `key save failed: HTTP ${res.status}`);
        }
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-16">
      <header className="mb-8">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">
          Welcome
        </p>
        <h1 className="mt-2 font-display text-display font-semibold">
          Set up your wiki.
        </h1>
        <p className="mt-3 text-body text-muted-foreground">
          Two things and you&apos;re in. The wiki itself lives at{" "}
          <code className="font-mono text-[13px]">{wikiPath}</code> — a folder of
          plain markdown files you fully own.
        </p>
      </header>

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        {needsTopic ? (
          <section>
            <h2 className="font-display text-h3 font-semibold">
              1. What is this wiki about?
            </h2>
            <p className="mt-1 text-ui text-muted-foreground">
              One line. The LLM reads it on every ingest and query, so the more
              specific the better.
            </p>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Quantum computing research and the algorithms underlying it"
              className="mt-3"
              autoFocus
            />
          </section>
        ) : null}

        {needsKey ? (
          <section>
            <h2 className="font-display text-h3 font-semibold">
              {needsTopic ? "2. " : ""}OpenRouter API key
            </h2>
            <p className="mt-1 text-ui text-muted-foreground">
              You bring your own key. We never see it. Get one at{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                openrouter.ai/keys
              </a>
              {" "}— pay-as-you-go, no minimums, gives you Claude / GPT / Gemini /
              Llama all from one key.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="font-mono text-[13px] sm:flex-1"
                autoComplete="off"
              />
              <Button
                variant="outline"
                onClick={onTest}
                disabled={!key.trim() || testing}
              >
                {testing ? "Testing…" : "Test"}
              </Button>
            </div>
            {testMessage ? (
              <p
                className={
                  "mt-2 text-xs " +
                  (testResult === "ok"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-destructive")
                }
              >
                {testMessage}
              </p>
            ) : null}
            <p className="mt-2 text-caption text-muted-foreground">
              Stored in your OS keychain when available, otherwise in{" "}
              <code className="font-mono">~/.llm-wiki/config.json</code> (chmod
              600). Never committed to git.
            </p>
          </section>
        ) : null}

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-caption text-muted-foreground">
            You can change either of these later in Settings.
          </p>
          <Button onClick={onSave} disabled={!canSubmit}>
            {busy ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-border/70 bg-muted/20 p-5 text-ui text-muted-foreground">
        <p className="font-medium text-foreground">What happens next</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            You add sources (paste, drop a file, or give a URL) on the{" "}
            <strong>Sources</strong> page.
          </li>
          <li>
            The agent reads each one and writes cross-linked pages into{" "}
            <strong>Wiki</strong>.
          </li>
          <li>
            You can <strong>Query</strong> for one-off answers, hold ongoing{" "}
            <strong>Chats</strong>, and run <strong>Lint</strong> to check the
            wiki for contradictions, broken links, and gaps.
          </li>
        </ol>
        <p className="mt-3">
          The whole thing is just markdown files on your disk. Edit them in
          Obsidian, sync with iCloud, version with git — your call.
        </p>
      </div>
    </div>
  );
}
