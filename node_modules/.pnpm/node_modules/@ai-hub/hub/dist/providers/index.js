import { MockProvider } from "./mockProvider.js";
const providers = new Map();
providers.set("mock", new MockProvider());
export function getProvider(name) {
    if (!name) {
        return providers.get("mock");
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
