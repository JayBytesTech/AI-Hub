import type { ChatProvider, StreamRequest } from "./types.js";
import { getHubConfig } from "../config.js";
import { ProviderError, executeWithReliability, providerHttpError } from "./reliability.js";

function chunkText(text: string) {
  return text.match(/\S+\s*/g) ?? [text];
}

export class GeminiProvider implements ChatProvider {
  readonly name = "gemini";

  async *stream(request: StreamRequest): AsyncGenerator<string, void, void> {
    const cfg = getHubConfig();
    const apiKey = cfg.providers.gemini.apiKey;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.providers.gemini.model)}` +
      `:generateContent?key=${encodeURIComponent(apiKey)}`;

    const text = await executeWithReliability(this.name, async (signal) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: request.prompt }] }]
        }),
        signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw providerHttpError(this.name, response.status, body);
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const content =
        payload.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("")
          .trim() ?? "";

      if (!content) {
        throw new ProviderError({
          provider: this.name,
          code: "empty_response",
          message: "Gemini returned an empty response",
          retryable: false
        });
      }
      return content;
    });

    if (!text) {
      throw new Error("Gemini returned an empty response");
    }

    for (const chunk of chunkText(text)) {
      yield chunk;
    }
  }
}
