// Server-only helpers that wrap @llm-wiki/core's config + secrets. Keep API
// routes thin; this file owns the policy around redaction and error shape.

import {
  deleteApiKey as coreDelete,
  getApiKey as coreGet,
  isKeychainAvailable,
  loadGlobalConfig,
  setApiKey as coreSet,
  type ApiKeyResult,
  type GlobalConfig,
} from "@llm-wiki/core";

export type ApiKeyStatus = {
  configured: boolean;
  source: ApiKeyResult["source"];
  keychainAvailable: boolean;
  /** Last 4 chars only, for "key ending in …abcd" UI text. Never the full key. */
  hint: string | null;
};

function keyHint(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return key;
  return key.slice(-4);
}

export async function getApiKeyStatus(): Promise<ApiKeyStatus> {
  const r = await coreGet();
  return {
    configured: r.key !== null,
    source: r.source,
    keychainAvailable: r.keychainAvailable,
    hint: keyHint(r.key),
  };
}

export async function setApiKey(key: string): Promise<ApiKeyStatus> {
  await coreSet(key.trim());
  return getApiKeyStatus();
}

export async function deleteApiKey(): Promise<ApiKeyStatus> {
  await coreDelete();
  return getApiKeyStatus();
}

export async function loadConfig(): Promise<GlobalConfig> {
  return loadGlobalConfig();
}

export { isKeychainAvailable };
