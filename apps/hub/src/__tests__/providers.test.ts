import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatGptProvider } from "../providers/chatgptProvider.js";
import { ClaudeProvider } from "../providers/claudeProvider.js";
import { GeminiProvider } from "../providers/geminiProvider.js";

const request = { runId: "r1", prompt: "hello" };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

async function collect(stream: AsyncGenerator<string, void, void>) {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
  }
  return output.trim();
}

describe("provider adapters", () => {
  it("chatgpt requires OPENAI_API_KEY", async () => {
    const provider = new ChatGptProvider();
    await expect(collect(provider.stream(request))).rejects.toThrow("OPENAI_API_KEY is not set");
  });

  it("claude requires ANTHROPIC_API_KEY", async () => {
    const provider = new ClaudeProvider();
    await expect(collect(provider.stream(request))).rejects.toThrow("ANTHROPIC_API_KEY is not set");
  });

  it("gemini requires GEMINI_API_KEY", async () => {
    const provider = new GeminiProvider();
    await expect(collect(provider.stream(request))).rejects.toThrow("GEMINI_API_KEY is not set");
  });

  it("chatgpt parses response text", async () => {
    process.env.OPENAI_API_KEY = "test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Hello from chatgpt" } }] })
      }))
    );

    const provider = new ChatGptProvider();
    await expect(collect(provider.stream(request))).resolves.toBe("Hello from chatgpt");
  });

  it("claude parses response text", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "Hello from claude" }] })
      }))
    );

    const provider = new ClaudeProvider();
    await expect(collect(provider.stream(request))).resolves.toBe("Hello from claude");
  });

  it("gemini parses response text", async () => {
    process.env.GEMINI_API_KEY = "test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Hello from gemini" }] } }]
        })
      }))
    );

    const provider = new GeminiProvider();
    await expect(collect(provider.stream(request))).resolves.toBe("Hello from gemini");
  });
});

