import type { ChatProvider, StreamRequest } from "./types.js";
import { getHubConfig } from "../config.js";
import { ProviderError, executeWithReliability, providerHttpError } from "./reliability.js";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function chunkText(text: string) {
  return text.match(/\S+\s*/g) ?? [text];
}

export class ClaudeProvider implements ChatProvider {
  readonly name = "claude";

  async *stream(request: StreamRequest): AsyncGenerator<string, void, void> {
    const cfg = getHubConfig();
    const apiKey = cfg.providers.anthropic.apiKey;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const text = await executeWithReliability(this.name, async (signal) => {
      const response = await fetch(CLAUDE_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: cfg.providers.anthropic.model,
          max_tokens: 1024,
          messages: [{ role: "user", content: request.prompt }]
        }),
        signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw providerHttpError(this.name, response.status, body);
      }

      const payload = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const content =
        payload.content
          ?.filter((item) => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text as string)
          .join("") ?? "";

      if (!content) {
        throw new ProviderError({
          provider: this.name,
          code: "empty_response",
          message: "Claude returned an empty response",
          retryable: false
        });
      }

      return content;
    });

    if (!text) {
      throw new Error("Claude returned an empty response");
    }

    for (const chunk of chunkText(text)) {
      yield chunk;
    }
  }
}
