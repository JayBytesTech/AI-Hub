import type { ChatProvider, StreamRequest } from "./types.js";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-latest";

function chunkText(text: string) {
  return text.match(/\S+\s*/g) ?? [text];
}

export class ClaudeProvider implements ChatProvider {
  readonly name = "claude";

  async *stream(request: StreamRequest): AsyncGenerator<string, void, void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: request.prompt }]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Claude request failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text =
      payload.content
        ?.filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text as string)
        .join("") ?? "";

    if (!text) {
      throw new Error("Claude returned an empty response");
    }

    for (const chunk of chunkText(text)) {
      yield chunk;
    }
  }
}

