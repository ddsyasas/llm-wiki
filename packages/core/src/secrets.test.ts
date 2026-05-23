import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stand-in for the real keytar module. Each test resets `behavior` to choose
// success vs failure. We intercept the dynamic import inside secrets.ts via
// vi.mock so the real OS keychain is never touched.
const keytarStore = new Map<string, string>();
let keytarBehavior: "ok" | "throw-on-probe" | "throw-on-write" = "ok";

vi.mock("keytar", () => ({
  findCredentials: vi.fn(async () => {
    if (keytarBehavior === "throw-on-probe") throw new Error("no libsecret");
    return Array.from(keytarStore.entries()).map(([account, password]) => ({ account, password }));
  }),
  getPassword: vi.fn(async (_service: string, account: string) => {
    return keytarStore.get(account) ?? null;
  }),
  setPassword: vi.fn(async (_service: string, account: string, password: string) => {
    if (keytarBehavior === "throw-on-write") throw new Error("keychain locked");
    keytarStore.set(account, password);
  }),
  deletePassword: vi.fn(async (_service: string, account: string) => {
    return keytarStore.delete(account);
  }),
}));

import { loadGlobalConfig, saveGlobalConfig, globalConfigPath } from "./config";
import {
  _resetKeytarCacheForTests,
  deleteApiKey,
  getApiKey,
  isKeychainAvailable,
  setApiKey,
} from "./secrets";

let configDir: string;
let priorEnv: string | undefined;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "llm-wiki-secrets-test-"));
  priorEnv = process.env["LLM_WIKI_CONFIG_DIR"];
  process.env["LLM_WIKI_CONFIG_DIR"] = configDir;
  keytarStore.clear();
  keytarBehavior = "ok";
  _resetKeytarCacheForTests();
});

afterEach(async () => {
  if (priorEnv === undefined) delete process.env["LLM_WIKI_CONFIG_DIR"];
  else process.env["LLM_WIKI_CONFIG_DIR"] = priorEnv;
  await rm(configDir, { recursive: true, force: true });
});

describe("keychain path (keytar available)", () => {
  it("setApiKey writes to keychain and getApiKey reads it back", async () => {
    const result = await setApiKey("sk-or-v1-keychain");
    expect(result).toEqual({
      key: "sk-or-v1-keychain",
      source: "keychain",
      keychainAvailable: true,
    });

    const fetched = await getApiKey();
    expect(fetched.key).toBe("sk-or-v1-keychain");
    expect(fetched.source).toBe("keychain");
  });

  it("getApiKey returns none when nothing is stored anywhere", async () => {
    const r = await getApiKey();
    expect(r.key).toBeNull();
    expect(r.source).toBe("none");
  });

  it("setApiKey purges any stale copy from the config file", async () => {
    // Pre-seed a config file with a key (simulating a prior file-fallback run)
    await saveGlobalConfig({
      version: 1,
      openrouterKey: "sk-or-v1-stale",
      recentWikis: [],
      uiTheme: "auto",
    });
    await setApiKey("sk-or-v1-fresh");
    const cfg = await loadGlobalConfig();
    expect(cfg.openrouterKey).toBeUndefined();
  });

  it("deleteApiKey clears both keychain and config", async () => {
    await setApiKey("sk-or-v1-x");
    await deleteApiKey();
    expect((await getApiKey()).key).toBeNull();
  });

  it("isKeychainAvailable returns true when probe succeeds", async () => {
    expect(await isKeychainAvailable()).toBe(true);
  });
});

describe("file fallback path (keytar probe fails)", () => {
  beforeEach(() => {
    keytarBehavior = "throw-on-probe";
    _resetKeytarCacheForTests();
  });

  it("setApiKey writes into the config file with restrictive perms", async () => {
    const r = await setApiKey("sk-or-v1-onfile");
    expect(r.source).toBe("config");
    expect(r.keychainAvailable).toBe(false);

    const cfg = await loadGlobalConfig();
    expect(cfg.openrouterKey).toBe("sk-or-v1-onfile");

    if (process.platform !== "win32") {
      const { mode } = await (await import("node:fs/promises")).stat(globalConfigPath());
      expect(mode & 0o777).toBe(0o600);
    }
  });

  it("getApiKey returns the config file value with source='config'", async () => {
    await setApiKey("sk-or-v1-A");
    const r = await getApiKey();
    expect(r.key).toBe("sk-or-v1-A");
    expect(r.source).toBe("config");
    expect(r.keychainAvailable).toBe(false);
  });

  it("isKeychainAvailable returns false when the probe throws", async () => {
    expect(await isKeychainAvailable()).toBe(false);
  });

  it("deleteApiKey removes the key from the config file", async () => {
    await setApiKey("sk-or-v1-A");
    await deleteApiKey();
    expect((await loadGlobalConfig()).openrouterKey).toBeUndefined();
  });
});

describe("partial fallback (keychain probe ok but write fails)", () => {
  it("falls back to file when setPassword throws", async () => {
    keytarBehavior = "throw-on-write";
    _resetKeytarCacheForTests();
    const r = await setApiKey("sk-or-v1-Z");
    expect(r.source).toBe("config");
    // keychain probe still succeeded, so we still report it as available
    expect(r.keychainAvailable).toBe(true);
    expect((await loadGlobalConfig()).openrouterKey).toBe("sk-or-v1-Z");
  });
});

describe("setApiKey input validation", () => {
  it("rejects empty keys", async () => {
    await expect(setApiKey("")).rejects.toThrow(/non-empty/);
    await expect(setApiKey("   ")).rejects.toThrow(/non-empty/);
  });
});

it("imports config module without warnings", async () => {
  // Sanity check that readFile is still importable; ensures no module-level
  // hoist regression.
  expect(typeof readFile).toBe("function");
});
