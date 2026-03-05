import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatGptProvider } from "../providers/chatgptProvider.js";
import { ClaudeProvider } from "../providers/claudeProvider.js";
import { GeminiProvider } from "../providers/geminiProvider.js";
import { resetReliabilityStateForTests } from "../providers/reliability.js";

const request = { runId: "r1", prompt: "hello" };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.PROVIDER_REQUEST_RETRIES;
  delete process.env.PROVIDER_REQUEST_TIMEOUT_MS;
  delete process.env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD;
  delete process.env.PROVIDER_CIRCUIT_COOLDOWN_MS;
  resetReliabilityStateForTests();
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

  it("chatgpt retries transient upstream errors", async () => {
    process.env.OPENAI_API_KEY = "test";
    process.env.PROVIDER_REQUEST_RETRIES = "1";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "unavailable"
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Recovered response" } }] })
      });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ChatGptProvider();
    await expect(collect(provider.stream(request))).resolves.toBe("Recovered response");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens circuit breaker after repeated failures", async () => {
    process.env.OPENAI_API_KEY = "test";
    process.env.PROVIDER_REQUEST_RETRIES = "0";
    process.env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD = "2";
    process.env.PROVIDER_CIRCUIT_COOLDOWN_MS = "60000";

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "down"
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ChatGptProvider();
    await expect(collect(provider.stream(request))).rejects.toThrow("upstream failed");
    await expect(collect(provider.stream(request))).rejects.toThrow("upstream failed");
    await expect(collect(provider.stream(request))).rejects.toThrow("circuit is open");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
