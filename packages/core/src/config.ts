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

// ---- Per-wiki settings (<wikiPath>/.llm-wiki/settings.json) ---------------
// Lives inside the wiki folder. Safe to commit alongside the wiki.

export type WikiSettings = {
  version: 1;
  topic: string;
  defaultModels: {
    ingest: string;
    query: string;
    lint: string;
    vision: string;
  };
  autoLintAfterIngest: boolean;
  showCostEstimates: boolean;
};

export const DEFAULT_WIKI_SETTINGS: WikiSettings = {
  version: 1,
  topic: "",
  defaultModels: {
    // Slugs follow OpenRouter conventions and the Claude 4.x family (current
    // as of 2026-05). If you bump these, also update
    // packages/llm/src/models.ts DEFAULT_MODELS to match.
    ingest: "anthropic/claude-haiku-4.5",
    query: "anthropic/claude-sonnet-4.6",
    lint: "anthropic/claude-sonnet-4.6",
    vision: "anthropic/claude-sonnet-4.6",
  },
  autoLintAfterIngest: false,
  showCostEstimates: true,
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
  const models = data["defaultModels"];
  if (typeof models === "object" && models !== null) {
    const m = models as Record<string, unknown>;
    for (const slot of ["ingest", "query", "lint", "vision"] as const) {
      if (typeof m[slot] === "string" && m[slot].length > 0) {
        out.defaultModels[slot] = m[slot] as string;
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
