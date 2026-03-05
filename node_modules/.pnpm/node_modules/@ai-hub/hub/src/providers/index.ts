import { MockProvider } from "./mockProvider.js";
import type { ChatProvider } from "./types.js";

const providers = new Map<string, ChatProvider>();

providers.set("mock", new MockProvider());

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

