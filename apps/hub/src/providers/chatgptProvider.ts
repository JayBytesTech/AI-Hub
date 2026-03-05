import type { ChatProvider, StreamRequest } from "./types.js";
import { ProviderError, executeWithReliability, providerHttpError } from "./reliability.js";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function chunkText(text: string) {
  return text.match(/\S+\s*/g) ?? [text];
}

export class ChatGptProvider implements ChatProvider {
  readonly name = "chatgpt";

  async *stream(request: StreamRequest): AsyncGenerator<string, void, void> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const text = await executeWithReliability(this.name, async (signal) => {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: "user", content: request.prompt }]
        }),
        signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw providerHttpError(this.name, response.status, body);
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) {
        throw new ProviderError({
          provider: this.name,
          code: "empty_response",
          message: "ChatGPT returned an empty response",
          retryable: false
        });
      }
      return content;
    });

    if (!text) {
      throw new Error("ChatGPT returned an empty response");
    }

    for (const chunk of chunkText(text)) {
      yield chunk;
    }
  }
}
