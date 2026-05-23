import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addRecentWiki,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_WIKI_SETTINGS,
  globalConfigPath,
  loadGlobalConfig,
  loadWikiSettings,
  saveGlobalConfig,
  saveWikiSettings,
  wikiSettingsPath,
} from "./config";
import { initWikiFolder } from "./wiki";

let configDir: string;
let priorEnv: string | undefined;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "llm-wiki-cfg-test-"));
  priorEnv = process.env["LLM_WIKI_CONFIG_DIR"];
  process.env["LLM_WIKI_CONFIG_DIR"] = configDir;
});

afterEach(async () => {
  if (priorEnv === undefined) delete process.env["LLM_WIKI_CONFIG_DIR"];
  else process.env["LLM_WIKI_CONFIG_DIR"] = priorEnv;
  await rm(configDir, { recursive: true, force: true });
});

describe("loadGlobalConfig", () => {
  it("returns defaults when the file does not exist", async () => {
    expect(await loadGlobalConfig()).toEqual(DEFAULT_GLOBAL_CONFIG);
  });

  it("round-trips a saved config", async () => {
    await saveGlobalConfig({
      version: 1,
      openrouterKey: "sk-or-v1-test",
      recentWikis: ["/a", "/b"],
      uiTheme: "dark",
    });
    expect(await loadGlobalConfig()).toEqual({
      version: 1,
      openrouterKey: "sk-or-v1-test",
      recentWikis: ["/a", "/b"],
      uiTheme: "dark",
    });
  });

  it("merges partial files with defaults and ignores unknown fields", async () => {
    await writeFile(globalConfigPath(), JSON.stringify({ uiTheme: "light", junk: 42 }), "utf8");
    const cfg = await loadGlobalConfig();
    expect(cfg.uiTheme).toBe("light");
    expect(cfg.recentWikis).toEqual([]);
    expect(cfg.openrouterKey).toBeUndefined();
  });

  it("rejects an unparseable JSON file", async () => {
    await writeFile(globalConfigPath(), "not json", "utf8");
    await expect(loadGlobalConfig()).rejects.toThrow(/not valid JSON/);
  });

  it("rejects a non-object root value", async () => {
    await writeFile(globalConfigPath(), "[]", "utf8");
    await expect(loadGlobalConfig()).rejects.toThrow(/expected a JSON object/);
  });
});

describe("saveGlobalConfig", () => {
  it("creates the directory and writes with 0600 permissions on POSIX", async () => {
    await saveGlobalConfig({ ...DEFAULT_GLOBAL_CONFIG, openrouterKey: "sk-or-v1-x" });
    const s = await stat(globalConfigPath());
    if (process.platform !== "win32") {
      // On POSIX systems, mode & 0o777 should equal 0o600.
      expect(s.mode & 0o777).toBe(0o600);
    }
  });

  it("ignores an invalid theme value when loading", async () => {
    await writeFile(globalConfigPath(), JSON.stringify({ uiTheme: "neon" }), "utf8");
    expect((await loadGlobalConfig()).uiTheme).toBe("auto");
  });
});

describe("addRecentWiki", () => {
  it("prepends, deduplicates, and caps at 10", async () => {
    await addRecentWiki("/a");
    await addRecentWiki("/b");
    let cfg = await addRecentWiki("/a"); // move to front
    expect(cfg.recentWikis).toEqual(["/a", "/b"]);

    for (let i = 0; i < 12; i++) {
      cfg = await addRecentWiki(`/wiki-${i}`);
    }
    expect(cfg.recentWikis).toHaveLength(10);
    expect(cfg.recentWikis[0]).toBe("/wiki-11");
  });
});

describe("wiki settings", () => {
  let wikiPath: string;

  beforeEach(async () => {
    wikiPath = await mkdtemp(join(tmpdir(), "llm-wiki-settings-test-"));
    await initWikiFolder(wikiPath);
  });

  afterEach(async () => {
    await rm(wikiPath, { recursive: true, force: true });
  });

  it("returns defaults when the file is absent", async () => {
    const s = await loadWikiSettings(wikiPath);
    expect(s).toEqual({
      ...DEFAULT_WIKI_SETTINGS,
      defaultModels: { ...DEFAULT_WIKI_SETTINGS.defaultModels },
    });
  });

  it("round-trips a full settings object", async () => {
    const next = {
      ...DEFAULT_WIKI_SETTINGS,
      defaultModels: { ...DEFAULT_WIKI_SETTINGS.defaultModels },
      topic: "Quantum Computing",
      autoLintAfterIngest: true,
      showCostEstimates: false,
    };
    await saveWikiSettings(wikiPath, next);
    expect(await loadWikiSettings(wikiPath)).toEqual(next);
  });

  it("merges partial settings file with defaults per model slot", async () => {
    await writeFile(
      wikiSettingsPath(wikiPath),
      JSON.stringify({ defaultModels: { query: "openai/gpt-4o" } }),
      "utf8",
    );
    const s = await loadWikiSettings(wikiPath);
    expect(s.defaultModels.query).toBe("openai/gpt-4o");
    expect(s.defaultModels.ingest).toBe(DEFAULT_WIKI_SETTINGS.defaultModels.ingest);
    expect(s.showCostEstimates).toBe(DEFAULT_WIKI_SETTINGS.showCostEstimates);
  });

  it("writes to .llm-wiki/settings.json inside the wiki folder", async () => {
    await saveWikiSettings(wikiPath, {
      ...DEFAULT_WIKI_SETTINGS,
      defaultModels: { ...DEFAULT_WIKI_SETTINGS.defaultModels },
      topic: "X",
    });
    const content = await readFile(wikiSettingsPath(wikiPath), "utf8");
    expect(content).toContain('"topic": "X"');
  });
});
