"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  needsTopic: boolean;
  needsKey: boolean;
  initialTopic: string;
  wikiPath: string;
  /**
   * True only on the very first app open (no onboardingCompletedAt in
   * global config yet). Drives the choice between the full 4-step welcome
   * wizard and the minimal topic+key form returning users see if they
   * spin up a new wiki later that's missing one of those.
   */
  isFirstRun: boolean;
};

type Step = "welcome" | "topic" | "key" | "tour";
const STEP_ORDER: Step[] = ["welcome", "topic", "key", "tour"];

export function Onboarding(props: Props) {
  // First-run users get the full wizard; everyone else gets the same compact
  // form we've always had. Single component so the save plumbing is shared.
  if (props.isFirstRun) {
    return <FirstRunWizard {...props} />;
  }
  return <MinimalOnboarding {...props} />;
}

// ---- the welcome wizard -------------------------------------------------

function FirstRunWizard(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [topic, setTopic] = useState(props.initialTopic);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  function goTo(next: Step) {
    setError(null);
    setStep(next);
  }

  async function persist(topicToSave: string, keyToSave: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      if (props.needsTopic && topicToSave.trim()) {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic: topicToSave.trim() }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `topic save failed: HTTP ${res.status}`);
        }
      }
      if (props.needsKey && keyToSave.trim()) {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: keyToSave.trim() }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `key save failed: HTTP ${res.status}`);
        }
      }
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function markOnboardingDone(): Promise<void> {
    try {
      await fetch("/api/onboarding", { method: "POST" });
    } catch {
      // Non-fatal — the user just sees the wizard again on next visit,
      // which is annoying but not broken. Don't gate the redirect on it.
    }
  }

  // Skip from any step: save whatever's been entered, mark onboarding done,
  // and fall back to the minimal form (which only shows if topic/key still
  // missing — otherwise the dashboard appears).
  async function onSkip() {
    await persist(topic, key);
    await markOnboardingDone();
    router.refresh();
  }

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

  // Step 3 → Step 4 transition: save before advancing so the user can't
  // back-button into a state where their data was lost.
  async function onAdvanceFromKey() {
    const ok = await persist(topic, key);
    if (ok) goTo("tour");
  }

  // Step 4 final: mark onboarding complete + navigate the user to Sources
  // where they take their first real action (ingesting a source).
  async function onFinish(destination: "sources" | "home" = "sources") {
    await markOnboardingDone();
    if (destination === "sources") router.push("/sources");
    else router.refresh();
  }

  const currentIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-12">
      {/* Stepper — visible only after the welcome screen to keep step 1
          uncluttered. Calm dots, no labels (would crowd the layout). */}
      {step !== "welcome" ? (
        <ol className="mb-8 flex items-center justify-center gap-2" aria-label="Progress">
          {STEP_ORDER.slice(1).map((s, i) => {
            const idx = i + 1;
            const active = currentIdx === idx;
            const done = currentIdx > idx;
            return (
              <li
                key={s}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "h-1.5 w-10 rounded-full transition-colors",
                  done ? "bg-primary" : active ? "bg-primary/70" : "bg-border",
                )}
              />
            );
          })}
        </ol>
      ) : null}

      {step === "welcome" ? (
        <WelcomeStep
          wikiPath={props.wikiPath}
          onNext={() => goTo("topic")}
          onSkip={onSkip}
          busy={busy}
        />
      ) : null}

      {step === "topic" ? (
        <TopicStep
          topic={topic}
          setTopic={setTopic}
          onBack={() => goTo("welcome")}
          onNext={() => goTo("key")}
          onSkip={onSkip}
          busy={busy}
        />
      ) : null}

      {step === "key" ? (
        <KeyStep
          apiKey={key}
          setApiKey={setKey}
          onBack={() => goTo("topic")}
          onNext={onAdvanceFromKey}
          onSkip={onSkip}
          onTest={onTest}
          testing={testing}
          testResult={testResult}
          testMessage={testMessage}
          busy={busy}
          error={error}
        />
      ) : null}

      {step === "tour" ? (
        <TourStep
          onBack={() => goTo("key")}
          onSkip={() => void onFinish("home")}
          onFinish={() => void onFinish("sources")}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

// ---- step components ----------------------------------------------------

function WelcomeStep({
  wikiPath,
  onNext,
  onSkip,
  busy,
}: {
  wikiPath: string;
  onNext: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  return (
    <div className="text-center">
      <p
        aria-hidden
        className="font-mono text-3xl leading-none text-primary"
      >
        [[
      </p>
      <h1 className="mt-4 font-display text-display font-semibold tracking-tight">
        LLM Wiki
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-body font-serif text-muted-foreground">
        A personal Wikipedia an LLM maintains for you. Drop in articles, papers,
        notes — an agent reads them and writes cross-linked pages. Knowledge
        compounds.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-caption text-muted-foreground">
        Your wiki lives in <code className="font-mono">{wikiPath}</code> as plain
        markdown files you fully own.
      </p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <Button onClick={onNext} disabled={busy}>
          Get started →
        </Button>
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={busy}
        className="mt-4 text-caption text-muted-foreground hover:text-foreground"
      >
        skip the tour
      </button>
    </div>
  );
}

function TopicStep({
  topic,
  setTopic,
  onBack,
  onNext,
  onSkip,
  busy,
}: {
  topic: string;
  setTopic: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const ready = topic.trim().length > 0;
  return (
    <div>
      <p className="text-caption uppercase tracking-wider text-muted-foreground">
        Step 1 of 3
      </p>
      <h2 className="mt-2 font-display text-h1 font-semibold tracking-tight">
        What is this wiki about?
      </h2>
      <p className="mt-3 text-body font-serif text-muted-foreground">
        One line describing the scope. The LLM reads it on every operation —
        ingest, query, lint — so be specific rather than generic.
      </p>
      <Input
        autoFocus
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready) onNext();
        }}
        placeholder='e.g. "Quantum computing research and the algorithms underlying it"'
        className="mt-5 text-base"
      />
      <p className="mt-2 text-caption text-muted-foreground">
        You can change this later in Settings → General.
      </p>
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="text-caption text-muted-foreground hover:text-foreground"
          >
            skip the tour
          </button>
          <Button onClick={onNext} disabled={!ready || busy}>
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}

function KeyStep({
  apiKey,
  setApiKey,
  onBack,
  onNext,
  onSkip,
  onTest,
  testing,
  testResult,
  testMessage,
  busy,
  error,
}: {
  apiKey: string;
  setApiKey: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onTest: () => void;
  testing: boolean;
  testResult: "ok" | "fail" | null;
  testMessage: string | null;
  busy: boolean;
  error: string | null;
}) {
  const ready = apiKey.trim().length > 0;
  return (
    <div>
      <p className="text-caption uppercase tracking-wider text-muted-foreground">
        Step 2 of 3
      </p>
      <h2 className="mt-2 font-display text-h1 font-semibold tracking-tight">
        OpenRouter API key
      </h2>
      <p className="mt-3 text-body font-serif text-muted-foreground">
        You bring your own key — we never see it. One key gives access to Claude
        / GPT / Gemini / Llama through{" "}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2"
        >
          openrouter.ai/keys
        </a>
        . Pay-as-you-go, no minimums.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Input
          autoFocus
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-or-v1-..."
          className="font-mono text-[13px] sm:flex-1"
          autoComplete="off"
        />
        <Button variant="outline" onClick={onTest} disabled={!ready || testing || busy}>
          {testing ? "Testing…" : "Test"}
        </Button>
      </div>
      {testMessage ? (
        <p
          className={cn(
            "mt-2 text-xs",
            testResult === "ok"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-destructive",
          )}
        >
          {testMessage}
        </p>
      ) : null}
      <p className="mt-2 text-caption text-muted-foreground">
        Stored in your OS keychain when available, otherwise in{" "}
        <code className="font-mono">~/.llm-wiki/config.json</code> (chmod 600).
        Never committed to git.
      </p>
      {error ? (
        <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="text-caption text-muted-foreground hover:text-foreground"
          >
            skip the tour
          </button>
          <Button onClick={onNext} disabled={!ready || busy}>
            {busy ? "Saving…" : "Next →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TourStep({
  onBack,
  onSkip,
  onFinish,
  busy,
}: {
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
  busy: boolean;
}) {
  return (
    <div>
      <p className="text-caption uppercase tracking-wider text-muted-foreground">
        Step 3 of 3
      </p>
      <h2 className="mt-2 font-display text-h1 font-semibold tracking-tight">
        Here's what you'll do
      </h2>
      <p className="mt-3 text-body font-serif text-muted-foreground">
        Five surfaces, one workflow. Every operation works against the wiki
        folder you just set up.
      </p>

      <ul className="mt-6 space-y-3">
        <TourRow
          numeral="①"
          title="Sources"
          body="Paste an article, drop a PDF, or pull a URL. The agent reads it and writes pages."
        />
        <TourRow
          numeral="②"
          title="Wiki"
          body="Browse the pages the LLM wrote, grouped by type. Full backlinks + source lineage on every page."
        />
        <TourRow
          numeral="③"
          title="Graph"
          body="A 3D view of your knowledge as a network — nodes for pages, edges for cross-links. Watch it grow as you ingest more."
        />
        <TourRow
          numeral="④"
          title="Query / Chats"
          body="Ask one-shot questions with citations, or hold multi-turn threads. Save good answers back into the wiki."
        />
        <TourRow
          numeral="⑤"
          title="Lint"
          body="Periodic health check — contradictions, broken links, gaps — with one-click fixes."
        />
      </ul>

      <p className="mt-6 text-caption text-muted-foreground">
        Full how-to lives at <Link href="/help" className="text-primary underline underline-offset-2">/help</Link> once you're in.
      </p>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="text-caption text-muted-foreground hover:text-foreground"
          >
            skip
          </button>
          <Button onClick={onFinish} disabled={busy}>
            {busy ? "…" : "Take me to Sources →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TourRow({
  numeral,
  title,
  body,
}: {
  numeral: string;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-baseline gap-4 rounded-md border border-border/70 bg-card p-4">
      <span aria-hidden className="font-display text-h2 text-primary/80">
        {numeral}
      </span>
      <div>
        <p className="font-display text-h3 font-medium tracking-tight">{title}</p>
        <p className="mt-0.5 text-ui text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

// ---- minimal form (returning users) -------------------------------------

// The original single-card layout. Fires when a wiki has missing topic/key
// AFTER the user has already completed the welcome wizard at some point.
// Common case: they created a new wiki via Settings → Wikis → Create and
// somehow ended up here (shouldn't happen often since the Create form
// collects the topic), or the API key got removed.
function MinimalOnboarding({
  needsTopic,
  needsKey,
  initialTopic,
  wikiPath,
}: Props) {
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
          Almost there
        </p>
        <h1 className="mt-2 font-display text-display font-semibold">
          Finish setting up this wiki.
        </h1>
        <p className="mt-3 text-body text-muted-foreground">
          {needsTopic && needsKey
            ? "We just need a topic and an OpenRouter key to get going."
            : needsTopic
              ? "We just need a topic for this wiki."
              : "We just need an OpenRouter key to enable the LLM."}{" "}
          Wiki at <code className="font-mono text-[13px]">{wikiPath}</code>.
        </p>
      </header>

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        {needsTopic ? (
          <section>
            <h2 className="font-display text-h3 font-semibold">
              {needsKey ? "1. " : ""}What is this wiki about?
            </h2>
            <p className="mt-1 text-ui text-muted-foreground">
              One line. The LLM reads it on every ingest and query, so the more
              specific the better.
            </p>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder='e.g. "Quantum computing research"'
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
              Get one at{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                openrouter.ai/keys
              </a>
              . Stored in your OS keychain when available.
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
                className={cn(
                  "mt-2 text-xs",
                  testResult === "ok"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-destructive",
                )}
              >
                {testMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end border-t border-border pt-4">
          <Button onClick={onSave} disabled={!canSubmit}>
            {busy ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
