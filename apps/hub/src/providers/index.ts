import { MockProvider } from "./mockProvider.js";
import { ClaudeProvider } from "./claudeProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import { ChatGptProvider } from "./chatgptProvider.js";
import type { ChatProvider } from "./types.js";

const providers = new Map<string, ChatProvider>();

providers.set("mock", new MockProvider());
providers.set("claude", new ClaudeProvider());
providers.set("gemini", new GeminiProvider());
providers.set("chatgpt", new ChatGptProvider());

export function getProvider(name: string | undefined): ChatProvider {
  if (!name) {
    return providers.get("mock") as ChatProvider;
  }

  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return provider;
}

export function listProviders() {
  return [...providers.keys()];
}
