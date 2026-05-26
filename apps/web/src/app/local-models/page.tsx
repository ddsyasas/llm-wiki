import Link from "next/link";

import { PageContainer } from "@/components/page-shell";

export const dynamic = "force-dynamic";

// Standalone setup guide for using Ollama (local LLM runtime) with LLM Wiki.
// Linked from:
//  - Settings → Models tab (amber banner when any slot uses Ollama)
//  - /help (under the Settings section)
//  - /developers (under the LLM provider section)
// Public route, no auth, no setup-gate — should be reachable even before
// the user has configured anything else.
export default function LocalModelsPage() {
  return (
    <PageContainer width="lg">
      <header className="mb-12">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">
          Setup guide
        </p>
        <h1 className="mt-2 font-display text-display font-semibold tracking-tight">
          Local models with Ollama.
        </h1>
        <p className="mt-5 max-w-2xl text-body font-serif text-muted-foreground">
          Selecting <strong>Ollama (Local)</strong> as a provider in{" "}
          <Link href="/settings" className="text-primary underline underline-offset-2">
            Settings → Models
          </Link>{" "}
          routes that operation to a local LLM running on your own machine.
          Free per query, fully private, but requires installing Ollama + pulling
          the model yourself first. This page walks through both, plus what your
          hardware can realistically run.
        </p>
      </header>

      {/* TOC — long page, helps scanning */}
      <nav className="mb-12 rounded-md border border-border/70 bg-card p-4">
        <p className="mb-2 text-caption uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-ui sm:grid-cols-2">
          {TOC.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="text-foreground/80 hover:text-primary">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="why" eyebrow="When to use this" title="Local vs cloud — when each makes sense">
        <p>
          You probably want Ollama if any of these apply:
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Privacy matters.</strong> Source documents never leave your
            machine. Useful for confidential research, legal notes, medical
            records, anything you wouldn't paste into ChatGPT.
          </li>
          <li>
            <strong>You ingest a lot.</strong> Pay-per-token costs add up if
            you're feeding the wiki hundreds of sources. Local is free per query
            (electricity only) after the one-time model download.
          </li>
          <li>
            <strong>You want offline capability.</strong> Once a model is pulled,
            Ollama works without internet. Useful on flights, in secure
            environments, or when your connection is flaky.
          </li>
          <li>
            <strong>You're experimenting.</strong> Try different model sizes,
            compare output styles, learn how LLMs actually behave — all without
            burning API credits.
          </li>
        </ul>
        <p>
          You probably want OpenRouter (cloud) if:
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Quality matters most</strong> — frontier models (Claude 4.6,
            GPT-4o, Gemini 2.5 Pro) are still substantially smarter than the
            best open models you can run locally.
          </li>
          <li>
            <strong>Your hardware is modest.</strong> A 5-year-old laptop with
            8 GB RAM can run small local models, but slowly and badly. Cloud is
            always fast.
          </li>
          <li>
            <strong>You only need it occasionally.</strong> $5 of OpenRouter
            credit can last weeks at default models. Below that threshold, the
            mental cost of managing a local model is more than the dollar cost
            of the cloud one.
          </li>
        </ul>
        <p>
          <strong>Mixed usage works fine.</strong> You can set Ingest to Ollama
          (heavy, you-don't-want-to-watch-it) and Chat to OpenRouter (interactive,
          want frontier quality). LLM Wiki picks per-slot.
        </p>
      </Section>

      <Section id="install" eyebrow="Step 1" title="Install Ollama">
        <p>
          One-time install. Pick your OS:
        </p>

        <h3 className="mt-6 font-display text-h3 font-semibold tracking-tight">macOS</h3>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-3 text-[12px]">
{`# With Homebrew (recommended — auto-starts a background service)
brew install ollama

# Or download the .dmg installer from https://ollama.com/download`}
        </pre>
        <p className="mt-2 text-caption text-muted-foreground">
          Apple Silicon (M1+) gets GPU acceleration out of the box. Intel Macs
          work but slower.
        </p>

        <h3 className="mt-6 font-display text-h3 font-semibold tracking-tight">Linux</h3>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-3 text-[12px]">
{`curl -fsSL https://ollama.com/install.sh | sh`}
        </pre>
        <p className="mt-2 text-caption text-muted-foreground">
          NVIDIA GPUs auto-detected via CUDA. AMD has limited support — see{" "}
          <a
            href="https://github.com/ollama/ollama/blob/main/docs/gpu.md"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Ollama GPU docs
          </a>
          .
        </p>

        <h3 className="mt-6 font-display text-h3 font-semibold tracking-tight">Windows</h3>
        <p>
          Download the installer from{" "}
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            ollama.com/download
          </a>
          . Runs natively on Windows 10/11; works inside WSL too if you prefer.
        </p>

        <h3 className="mt-6 font-display text-h3 font-semibold tracking-tight">Verify it's running</h3>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-3 text-[12px]">
{`curl http://localhost:11434/api/version`}
        </pre>
        <p>
          Should print something like <code>{`{"version":"0.x.x"}`}</code>. If
          you get <em>connection refused</em>, run <code>ollama serve</code> in a
          terminal to start the service manually.
        </p>
      </Section>

      <Section id="pull" eyebrow="Step 2" title="Pull a model">
        <p>
          Models aren't included with Ollama itself — you download each one once
          and they're cached locally. From a terminal:
        </p>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-3 text-[12px]">
{`# General-purpose, fast, good default
ollama pull llama3

# Smaller + faster, lower quality
ollama pull phi3

# Vision-capable (for PDFs and images)
ollama pull llava

# Full library: https://ollama.com/library`}
        </pre>
        <p>
          Download size + speed depends on your connection — count on 1-2 minutes
          for a 4-5 GB model on broadband. Models persist in{" "}
          <code className="font-mono">~/.ollama/models/</code> and you only need
          to pull each one once.
        </p>
        <p>
          To see what you've pulled: <code>ollama list</code>. To remove one:{" "}
          <code>ollama rm &lt;name&gt;</code>.
        </p>
      </Section>

      <Section id="hardware" eyebrow="Picking right" title="Hardware requirements per model">
        <p>
          The single biggest factor in whether a local model is useful or painful
          is whether your hardware can run it comfortably. Numbers below assume{" "}
          <strong>4-bit quantized</strong> versions (Ollama's default — half the
          memory of full precision, near-identical quality for most use cases).
        </p>
        <p>
          <strong>Speed numbers</strong> are tokens/sec on the listed hardware,
          rough order-of-magnitude. Real-world varies ±50%.
        </p>

        <div className="overflow-x-auto">
          <table className="my-6 w-full min-w-[700px] border-collapse text-ui">
            <thead>
              <tr className="border-b-2 border-border text-left">
                <th className="py-2 pr-4 font-display font-semibold">Model</th>
                <th className="py-2 pr-4 font-display font-semibold">Disk</th>
                <th className="py-2 pr-4 font-display font-semibold">RAM (min / good)</th>
                <th className="py-2 pr-4 font-display font-semibold">M3 Mac</th>
                <th className="py-2 pr-4 font-display font-semibold">Modern CPU only</th>
                <th className="py-2 font-display font-semibold">Best for</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {HARDWARE_TABLE.map((row) => (
                <tr key={row.model} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono">{row.model}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{row.disk}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{row.ram}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{row.mac}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{row.cpu}</td>
                  <td className="py-2 text-muted-foreground">{row.useFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 font-display text-h3 font-semibold tracking-tight">Quick picker</h3>
        <ul className="space-y-2">
          <li>
            <strong>Most modern laptop (8-16 GB RAM)</strong> → <code>llama3</code> or <code>mistral</code>. Reliable, balanced.
          </li>
          <li>
            <strong>Old / underpowered machine (≤8 GB RAM)</strong> → <code>phi3</code>. Still usable. Output quality drops.
          </li>
          <li>
            <strong>Apple Silicon 16-32 GB</strong> → <code>llama3</code> for general, <code>phi3:medium</code> when you want more quality and don't mind slower.
          </li>
          <li>
            <strong>Apple Silicon 64+ GB unified, or workstation with 64+ GB RAM</strong> → <code>llama3:70b</code> or <code>mixtral</code>. Real frontier-ish quality, fully local.
          </li>
          <li>
            <strong>Need vision (PDFs, images)</strong> → <code>llava</code> for quality, <code>moondream</code> for speed.
          </li>
        </ul>

        <p className="mt-6">
          <strong>Rule of thumb on RAM</strong>: the model needs roughly its
          file-size in RAM, plus 2-4 GB for the OS, plus context window overhead.
          Running a model that's bigger than your free RAM will use swap, which
          drops speeds by 10-50x and is usually painful enough to be unusable.
        </p>
      </Section>

      <Section id="connect" eyebrow="Step 3" title="Connect it to LLM Wiki">
        <p>
          With Ollama running and at least one model pulled:
        </p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            Open{" "}
            <Link href="/settings" className="text-primary underline underline-offset-2">
              Settings → Models
            </Link>
          </li>
          <li>
            For any operation slot (ingest / query / chat / lint / vision):
            change the <strong>Provider</strong> dropdown from{" "}
            <em>OpenRouter</em> to <em>Ollama (Local)</em>
          </li>
          <li>
            Pick a model from the dropdown — only pick models you&apos;ve
            actually pulled via <code>ollama pull &lt;name&gt;</code>
          </li>
          <li>
            Click <strong>Save</strong>. New operations on that slot route to
            Ollama immediately.
          </li>
        </ol>
        <p>
          You can mix providers per slot. A common pattern: Ingest on Ollama
          (slow but free, good for batch work), Chat on OpenRouter (fast and
          smart for interactive use), Vision on whichever has the better vision
          model for your case.
        </p>
        <p>
          <strong>If you set ALL slots to Ollama</strong>, you don&apos;t need an
          OpenRouter API key at all. The first-run wizard&apos;s key step
          becomes optional once at least one slot is Ollama.
        </p>
      </Section>

      <Section id="custom-url" eyebrow="Advanced" title="Pointing at a non-default Ollama URL">
        <p>
          Ollama runs on <code>http://localhost:11434</code> by default. If
          yours runs elsewhere (different port, on another machine via tunnel,
          inside a Docker network), set the <code>OLLAMA_BASE_URL</code>{" "}
          environment variable before starting LLM Wiki:
        </p>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-3 text-[12px]">
{`# Example: Ollama running on a different port
export OLLAMA_BASE_URL=http://localhost:12345
llm-wiki start

# Example: Ollama on another machine on your LAN
export OLLAMA_BASE_URL=http://192.168.1.100:11434
llm-wiki start

# Example: Ollama exposed via a tunnel
export OLLAMA_BASE_URL=https://my-tunnel.example.com
llm-wiki start`}
        </pre>
        <p>
          LLM Wiki appends <code>/v1</code> to whatever you set, matching
          Ollama&apos;s OpenAI-compatible API. No need to include it yourself.
        </p>
      </Section>

      <Section id="troubleshooting" eyebrow="When it doesn't work" title="Troubleshooting">
        <ul className="space-y-3">
          <Trouble
            symptom={<>&ldquo;Connection error&rdquo; when running an operation</>}
            fix={<>Ollama isn&apos;t running. Try <code>curl http://localhost:11434/api/version</code> — if it fails, run <code>ollama serve</code> in a terminal.</>}
          />
          <Trouble
            symptom={<>&ldquo;Model not found&rdquo; or 404 from Ollama</>}
            fix={<>You picked a model in Settings that you haven&apos;t pulled. Run <code>ollama list</code> to see what&apos;s available; <code>ollama pull &lt;name&gt;</code> to add one.</>}
          />
          <Trouble
            symptom="Responses are very slow (under 5 tokens/sec, painful to read)"
            fix="Your hardware is below the model's comfortable range. Try a smaller model (phi3 instead of mistral, mistral instead of mixtral). Or accept that batch operations (ingest, lint) work fine and only chat is painful — and use OpenRouter for chat."
          />
          <Trouble
            symptom="Out of memory / system swap-thrashing during operations"
            fix="Same as slow: pick a smaller model. Or close other apps to free RAM. As a hard rule, the model's file size + 4 GB should comfortably fit in your free RAM."
          />
          <Trouble
            symptom="GPU isn't being used (CPU pegged, GPU idle)"
            fix={<>NVIDIA: check <code>nvidia-smi</code> while a query runs. AMD: support is incomplete. Apple Silicon: GPU is always used, no toggle. See <a href="https://github.com/ollama/ollama/blob/main/docs/gpu.md" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">Ollama GPU docs</a>.</>}
          />
          <Trouble
            symptom={<>&ldquo;OpenRouter API key not configured&rdquo; even though only some slots use OpenRouter</>}
            fix="At least one slot is still set to OpenRouter and needs the key. Either set ALL slots to Ollama, or add an OpenRouter key in Settings → API."
          />
        </ul>
      </Section>

      <Section id="more" eyebrow="Going further" title="Resources">
        <ul className="space-y-1">
          <li>
            <a
              href="https://ollama.com/library"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              ollama.com/library
            </a>{" "}
            — full list of available models with sizes + benchmarks
          </li>
          <li>
            <a
              href="https://github.com/ollama/ollama"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              github.com/ollama/ollama
            </a>{" "}
            — source code + issue tracker
          </li>
          <li>
            <a
              href="https://github.com/ollama/ollama/blob/main/docs/gpu.md"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              GPU compatibility docs
            </a>{" "}
            — what works on what
          </li>
          <li>
            <a
              href="https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Chatbot Arena Leaderboard
            </a>{" "}
            — independent quality rankings of LLMs (open + closed)
          </li>
        </ul>
      </Section>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/settings"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          ← Back to Settings
        </Link>
        <Link
          href="/help"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          Read the Help guide →
        </Link>
      </div>
    </PageContainer>
  );
}

// ─── small components (only used on this page) ────────────────────────────

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-16 scroll-mt-20">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-2 font-display text-h1 font-semibold tracking-tight">{title}</h2>
      <div className="mt-5 space-y-4 font-serif text-body text-foreground/85">{children}</div>
    </section>
  );
}

function Trouble({
  symptom,
  fix,
}: {
  symptom: React.ReactNode;
  fix: React.ReactNode;
}) {
  return (
    <li className="rounded-md border border-border/70 bg-card p-3">
      <p className="font-medium">{symptom}</p>
      <p className="mt-1 text-ui text-muted-foreground">{fix}</p>
    </li>
  );
}

// ─── content ──────────────────────────────────────────────────────────────

const TOC: Array<{ id: string; label: string }> = [
  { id: "why", label: "Local vs cloud — when each makes sense" },
  { id: "install", label: "Step 1: Install Ollama" },
  { id: "pull", label: "Step 2: Pull a model" },
  { id: "hardware", label: "Hardware requirements per model" },
  { id: "connect", label: "Step 3: Connect it to LLM Wiki" },
  { id: "custom-url", label: "Pointing at a non-default Ollama URL" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "more", label: "Resources" },
];

// Rough order-of-magnitude numbers. 4-bit quantized variants (Ollama default).
// Tokens/sec estimates from various reports; real-world ±50%.
const HARDWARE_TABLE = [
  {
    model: "phi3",
    disk: "2.3 GB",
    ram: "8 / 8 GB",
    mac: "50+ t/s",
    cpu: "15-25 t/s",
    useFor: "Lightweight chat, fast ingest",
  },
  {
    model: "moondream",
    disk: "1.6 GB",
    ram: "4 / 8 GB",
    mac: "80+ t/s",
    cpu: "20-30 t/s",
    useFor: "Fast vision, lower quality",
  },
  {
    model: "llama3",
    disk: "4.7 GB",
    ram: "8 / 16 GB",
    mac: "30-40 t/s",
    cpu: "8-12 t/s",
    useFor: "General-purpose default",
  },
  {
    model: "mistral",
    disk: "4.1 GB",
    ram: "8 / 16 GB",
    mac: "30-40 t/s",
    cpu: "8-15 t/s",
    useFor: "Concise output, good at code",
  },
  {
    model: "gemma2",
    disk: "5.5 GB",
    ram: "16 / 16 GB",
    mac: "25-35 t/s",
    cpu: "5-10 t/s",
    useFor: "Strong reasoning",
  },
  {
    model: "llava",
    disk: "4.7 GB",
    ram: "8 / 16 GB",
    mac: "25-35 t/s",
    cpu: "5-10 t/s",
    useFor: "Vision (PDFs/images)",
  },
  {
    model: "phi3:medium",
    disk: "7.9 GB",
    ram: "16 / 16 GB",
    mac: "20-30 t/s",
    cpu: "4-8 t/s",
    useFor: "Better quality, slower",
  },
  {
    model: "mixtral",
    disk: "26 GB",
    ram: "32 / 48 GB",
    mac: "15-25 t/s",
    cpu: "unusable",
    useFor: "Best open mid-sized model",
  },
  {
    model: "llama3:70b",
    disk: "40 GB",
    ram: "48 / 64 GB",
    mac: "5-15 t/s",
    cpu: "unusable",
    useFor: "Highest quality open, needs serious hardware",
  },
];
