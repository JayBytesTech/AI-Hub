import { MockProvider } from "./mockProvider.js";
import { ClaudeProvider } from "./claudeProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import { ChatGptProvider } from "./chatgptProvider.js";
import { getHubConfig, type ProviderName } from "../config.js";
import type { ChatProvider } from "./types.js";

const providers = new Map<ProviderName, ChatProvider>();

providers.set("mock", new MockProvider());
providers.set("claude", new ClaudeProvider());
providers.set("gemini", new GeminiProvider());
providers.set("chatgpt", new ChatGptProvider());

function enabledProviders() {
  const enabled = getHubConfig().providers.enabled;
  return enabled.filter((name) => providers.has(name));
}

export function getProvider(name: string | undefined): ChatProvider {
  const enabled = enabledProviders();
  if (enabled.length === 0) {
    throw new Error("No providers are enabled. Set HUB_ENABLED_PROVIDERS.");
  }

  if (!name) {
    const fallback = enabled.includes("mock") ? "mock" : enabled[0];
    return providers.get(fallback) as ChatProvider;
  }

  if (!enabled.includes(name as ProviderName)) {
    throw new Error(`Provider is disabled: ${name}`);
  }

  const provider = providers.get(name as ProviderName);
  if (!provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return provider;
}

export function listProviders() {
  return enabledProviders();
}
