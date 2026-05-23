import { loadGlobalConfig, saveGlobalConfig, globalConfigPath } from "./config";

// OS keychain identifiers. The "service" namespace lets keytar coexist with
// other apps that use the system keychain.
const SERVICE = "llm-wiki";
const ACCOUNT = "openrouter";

export type ApiKeySource = "keychain" | "config" | "none";

export type ApiKeyResult = {
  key: string | null;
  source: ApiKeySource;
  /** True when keytar is unusable on this host. Surface in the UI as a warning. */
  keychainAvailable: boolean;
};

// Lazy-import keytar so a load failure (e.g. Linux without libsecret)
// degrades cleanly to file storage instead of crashing the whole app.
type KeytarModule = typeof import("keytar");
let keytarPromise: Promise<KeytarModule | null> | null = null;

async function loadKeytar(): Promise<KeytarModule | null> {
  if (keytarPromise) return keytarPromise;
  keytarPromise = (async () => {
    try {
      const mod = await import("keytar");
      // Round-trip a probe call: native modules can import but throw on use
      // when the OS service isn't running. Findings:
      //   - macOS Keychain: always available
      //   - Windows Credential Manager: always available
      //   - Linux: requires gnome-keyring or KWallet via libsecret
      await mod.findCredentials(SERVICE);
      return mod;
    } catch {
      return null;
    }
  })();
  return keytarPromise;
}

export async function isKeychainAvailable(): Promise<boolean> {
  return (await loadKeytar()) !== null;
}

export async function getApiKey(): Promise<ApiKeyResult> {
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      const key = await keytar.getPassword(SERVICE, ACCOUNT);
      if (key) return { key, source: "keychain", keychainAvailable: true };
    } catch {
      // fall through to config-file lookup
    }
  }
  const cfg = await loadGlobalConfig();
  if (cfg.openrouterKey) {
    return { key: cfg.openrouterKey, source: "config", keychainAvailable: keytar !== null };
  }
  return { key: null, source: "none", keychainAvailable: keytar !== null };
}

export async function setApiKey(key: string): Promise<ApiKeyResult> {
  if (!key.trim()) throw new Error("setApiKey: key must be non-empty");
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE, ACCOUNT, key);
      // Successful keychain write — purge any stale copy from config.json so
      // the key never lives in two places.
      const cfg = await loadGlobalConfig();
      if (cfg.openrouterKey) {
        const { openrouterKey: _drop, ...rest } = cfg;
        void _drop;
        await saveGlobalConfig({ ...rest, version: 1 });
      }
      return { key, source: "keychain", keychainAvailable: true };
    } catch {
      // fall through to config-file storage
    }
  }
  const cfg = await loadGlobalConfig();
  await saveGlobalConfig({ ...cfg, openrouterKey: key });
  return { key, source: "config", keychainAvailable: keytar !== null };
}

export async function deleteApiKey(): Promise<void> {
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE, ACCOUNT);
    } catch {
      // ignore — the key may not have been set via keychain
    }
  }
  const cfg = await loadGlobalConfig();
  if (cfg.openrouterKey) {
    const { openrouterKey: _drop, ...rest } = cfg;
    void _drop;
    await saveGlobalConfig({ ...rest, version: 1 });
  }
}

/**
 * For tests: reset the cached keytar promise so a fresh probe runs. Production
 * code never needs this.
 */
export function _resetKeytarCacheForTests(): void {
  keytarPromise = null;
}

export function fileFallbackPath(): string {
  return globalConfigPath();
}
