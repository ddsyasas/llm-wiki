import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { WIKI_PATHS } from "./wiki";

// ---- Global config (~/.llm-wiki/config.json) ------------------------------
// One per user, shared across all wikis. Contains the OpenRouter API key (or
// a pointer to keychain) plus cross-wiki preferences like recent wikis and
// theme. NEVER commit this file.

export type UiTheme = "light" | "dark" | "auto";

export type GlobalConfig = {
  version: 1;
  /** Present only when keychain is unavailable. See secrets.ts. */
  openrouterKey?: string;
  /**
   * The wiki folder the app is currently pointing at. Written by the
   * Settings → Wikis picker. Consulted by apps/web's resolveWikiPath()
   * after env-var override and before the fallback default. Absent on
   * first run.
   */
  activeWiki?: string;
  /**
   * ISO timestamp set the first time the user completes (or skips) the
   * first-run welcome wizard. Once set, the wizard never shows the welcome
   * + tour steps again — only the minimal topic+key form when a wiki is
   * still missing them. Absent until the wizard fires for the first time.
   */
  onboardingCompletedAt?: string;
  recentWikis: string[];
  uiTheme: UiTheme;
};

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  version: 1,
  recentWikis: [],
  uiTheme: "auto",
};

const VALID_THEMES: UiTheme[] = ["light", "dark", "auto"];

// LLM_WIKI_CONFIG_DIR overrides the default for tests. Production callers
// pass nothing.
export function globalConfigDir(): string {
  return process.env["LLM_WIKI_CONFIG_DIR"] ?? join(homedir(), ".llm-wiki");
}

export function globalConfigPath(): string {
  return join(globalConfigDir(), "config.json");
}

function parseGlobalConfig(raw: unknown): GlobalConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("global config: expected a JSON object");
  }
  const data = raw as Record<string, unknown>;
  const out: GlobalConfig = { ...DEFAULT_GLOBAL_CONFIG };

  if (typeof data["openrouterKey"] === "string" && data["openrouterKey"].length > 0) {
    out.openrouterKey = data["openrouterKey"];
  }
  if (typeof data["activeWiki"] === "string" && data["activeWiki"].length > 0) {
    out.activeWiki = data["activeWiki"];
  }
  if (typeof data["onboardingCompletedAt"] === "string" && data["onboardingCompletedAt"].length > 0) {
    out.onboardingCompletedAt = data["onboardingCompletedAt"];
  }
  if (Array.isArray(data["recentWikis"])) {
    out.recentWikis = data["recentWikis"].filter((v): v is string => typeof v === "string");
  }
  if (typeof data["uiTheme"] === "string" && VALID_THEMES.includes(data["uiTheme"] as UiTheme)) {
    out.uiTheme = data["uiTheme"] as UiTheme;
  }
  return out;
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const path = globalConfigPath();
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_GLOBAL_CONFIG };
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`global config at ${path} is not valid JSON: ${(err as Error).message}`);
  }
  return parseGlobalConfig(parsed);
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  const dir = globalConfigDir();
  await mkdir(dir, { recursive: true });
  const path = globalConfigPath();
  const json = `${JSON.stringify(config, null, 2)}\n`;
  await writeFile(path, json, { encoding: "utf8", mode: 0o600 });
  // chmod separately in case the file already existed with looser perms.
  try {
    await chmod(path, 0o600);
  } catch {
    // best-effort; Windows ignores POSIX modes.
  }
}

export async function addRecentWiki(wikiPath: string): Promise<GlobalConfig> {
  const current = await loadGlobalConfig();
  const filtered = current.recentWikis.filter((p) => p !== wikiPath);
  const next: GlobalConfig = { ...current, recentWikis: [wikiPath, ...filtered].slice(0, 10) };
  await saveGlobalConfig(next);
  return next;
}

/**
 * Marks `wikiPath` as the active wiki for the app. The next call to
 * resolveWikiPath() (which reads this on every request) picks it up, so
 * the whole UI re-points to the new wiki without a server restart.
 *
 * Also adds the path to `recentWikis` so it shows up in the picker.
 */
export async function setActiveWiki(wikiPath: string): Promise<GlobalConfig> {
  const current = await loadGlobalConfig();
  const filtered = current.recentWikis.filter((p) => p !== wikiPath);
  const next: GlobalConfig = {
    ...current,
    activeWiki: wikiPath,
    recentWikis: [wikiPath, ...filtered].slice(0, 10),
  };
  await saveGlobalConfig(next);
  return next;
}

/**
 * Marks the first-run welcome wizard as completed. The next time the
 * onboarding gate fires (e.g. a new wiki has no topic yet), the user
 * gets the minimal topic+key form instead of the full welcome+tour
 * flow. Idempotent — re-call doesn't overwrite an existing timestamp.
 */
export async function setOnboardingCompleted(): Promise<GlobalConfig> {
  const current = await loadGlobalConfig();
  if (current.onboardingCompletedAt) return current;
  const next: GlobalConfig = {
    ...current,
    onboardingCompletedAt: new Date().toISOString(),
  };
  await saveGlobalConfig(next);
  return next;
}

/**
 * Drops a path from `recentWikis`. If it was also the active wiki, the
 * active field is cleared so resolveWikiPath() falls back to the default.
 * Does NOT touch the on-disk wiki folder — pure config edit.
 */
export async function removeRecentWiki(wikiPath: string): Promise<GlobalConfig> {
  const current = await loadGlobalConfig();
  const next: GlobalConfig = {
    ...current,
    recentWikis: current.recentWikis.filter((p) => p !== wikiPath),
  };
  if (current.activeWiki === wikiPath) {
    const { activeWiki: _drop, ...rest } = next;
    void _drop;
    await saveGlobalConfig({ ...rest, version: 1 });
    return { ...rest, version: 1 };
  }
  await saveGlobalConfig(next);
  return next;
}

// ---- Per-wiki settings (<wikiPath>/.llm-wiki/settings.json) ---------------
// Lives inside the wiki folder. Safe to commit alongside the wiki.

/** Which inference provider backs a model slot. */
export type ModelProvider = "openrouter" | "ollama";

const VALID_PROVIDERS: ModelProvider[] = ["openrouter", "ollama"];

/**
 * Configuration for a single operation slot.
 * `model` is a provider-specific model slug:
 *   - OpenRouter: e.g. "anthropic/claude-haiku-4.5"
 *   - Ollama:     e.g. "llama3", "mistral"
 */
export type ModelSlotConfig = {
  provider: ModelProvider;
  model: string;
};

export type WikiSettings = {
  version: 1;
  topic: string;
  defaultModels: {
    ingest: ModelSlotConfig;
    query: ModelSlotConfig;
    chat: ModelSlotConfig;
    lint: ModelSlotConfig;
    vision: ModelSlotConfig;
  };
  autoLintAfterIngest: boolean;
  showCostEstimates: boolean;
  /**
   * When true, ingest runs in dry-run mode — the LLM produces a proposal
   * (new pages, page updates, contradictions) but nothing is written to
   * disk until the user clicks Apply in the UI. Off by default since
   * most users want auto-apply.
   */
  requireApprovalForIngest: boolean;
};

/** Helper to build a slot config with an explicit provider. */
function slotConfig(model: string, provider: ModelProvider = "openrouter"): ModelSlotConfig {
  return { provider, model };
}

export const DEFAULT_WIKI_SETTINGS: WikiSettings = {
  version: 1,
  topic: "",
  defaultModels: {
    // Slugs follow OpenRouter conventions and the Claude 4.x family (current
    // as of 2026-05). If you bump these, also update
    // packages/llm/src/models.ts DEFAULT_MODELS to match.
    ingest: slotConfig("anthropic/claude-haiku-4.5"),
    query: slotConfig("anthropic/claude-sonnet-4.6"),
    chat: slotConfig("anthropic/claude-sonnet-4.6"),
    lint: slotConfig("anthropic/claude-sonnet-4.6"),
    vision: slotConfig("anthropic/claude-sonnet-4.6"),
  },
  autoLintAfterIngest: false,
  showCostEstimates: true,
  requireApprovalForIngest: false,
};

export function wikiSettingsPath(wikiPath: string): string {
  return join(wikiPath, WIKI_PATHS.tooling, "settings.json");
}

function parseWikiSettings(raw: unknown): WikiSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("wiki settings: expected a JSON object");
  }
  const data = raw as Record<string, unknown>;
  const out: WikiSettings = {
    ...DEFAULT_WIKI_SETTINGS,
    defaultModels: { ...DEFAULT_WIKI_SETTINGS.defaultModels },
  };

  if (typeof data["topic"] === "string") out.topic = data["topic"];
  if (typeof data["autoLintAfterIngest"] === "boolean") {
    out.autoLintAfterIngest = data["autoLintAfterIngest"];
  }
  if (typeof data["showCostEstimates"] === "boolean") {
    out.showCostEstimates = data["showCostEstimates"];
  }
  if (typeof data["requireApprovalForIngest"] === "boolean") {
    out.requireApprovalForIngest = data["requireApprovalForIngest"];
  }
  const models = data["defaultModels"];
  if (typeof models === "object" && models !== null) {
    const m = models as Record<string, unknown>;
    for (const slot of ["ingest", "query", "chat", "lint", "vision"] as const) {
      const raw = m[slot];
      if (typeof raw === "string" && raw.length > 0) {
        // Backward-compat: old format stored a plain model string.
        // Migrate to the new { provider, model } shape, defaulting to openrouter.
        out.defaultModels[slot] = { provider: "openrouter", model: raw };
      } else if (typeof raw === "object" && raw !== null) {
        const entry = raw as Record<string, unknown>;
        const model = typeof entry["model"] === "string" && entry["model"].length > 0
          ? entry["model"]
          : out.defaultModels[slot].model;
        const rawProvider = entry["provider"];
        const provider: ModelProvider =
          typeof rawProvider === "string" && VALID_PROVIDERS.includes(rawProvider as ModelProvider)
            ? (rawProvider as ModelProvider)
            : "openrouter";
        out.defaultModels[slot] = { provider, model };
      }
    }
  }
  return out;
}

export async function loadWikiSettings(wikiPath: string): Promise<WikiSettings> {
  const path = wikiSettingsPath(wikiPath);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ...DEFAULT_WIKI_SETTINGS,
        defaultModels: { ...DEFAULT_WIKI_SETTINGS.defaultModels },
      };
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`wiki settings at ${path} is not valid JSON: ${(err as Error).message}`);
  }
  return parseWikiSettings(parsed);
}

export async function saveWikiSettings(wikiPath: string, settings: WikiSettings): Promise<void> {
  const dir = join(wikiPath, WIKI_PATHS.tooling);
  await mkdir(dir, { recursive: true });
  const path = wikiSettingsPath(wikiPath);
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}
