import type { ChatProvider, StreamRequest } from "./types.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockProvider implements ChatProvider {
  readonly name = "mock";

  async *stream(request: StreamRequest): AsyncGenerator<string, void, void> {
    const prompt = request.prompt.trim();
    const base =
      prompt.length > 0
        ? `Mock response for: ${prompt}`
        : "Mock response: send a prompt to receive token deltas.";

    const tokens = base.split(/\s+/);
    for (const token of tokens) {
      await sleep(70);
      yield `${token} `;
    }
  }
}

