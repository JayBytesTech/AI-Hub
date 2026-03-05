# Hub Server

TypeScript Fastify hub service for REST + WebSocket APIs.

## Run

```bash
pnpm install
pnpm --filter @ai-hub/hub dev
```

Optional env vars:
- `HUB_PORT` (default `3000`)
- `HUB_HOST` (default `0.0.0.0`)
- `HUB_DB_PATH` (default `apps/hub/data/hub.db`)
- `TERMINAL_CONFIRM_REQUIRED` (default `true`)
- `ANTHROPIC_API_KEY` (required for `claude`)
- `CLAUDE_MODEL` (default `claude-3-5-sonnet-latest`)
- `GEMINI_API_KEY` (required for `gemini`)
- `GEMINI_MODEL` (default `gemini-1.5-flash`)
- `OPENAI_API_KEY` (required for `chatgpt`)
- `OPENAI_MODEL` (default `gpt-4o-mini`)

## API

Base URL: `http://localhost:3000/v1`

- `GET /health`
- `GET /workspaces`
- `POST /workspaces`
- `GET /workspaces/:id`
- `GET /workspaces/:id/files?path=.`
- `GET /workspaces/:id/file?path=README.md`
- `GET /threads`
- `POST /threads`
- `GET /threads/:id/messages`
- `GET /tasks`
- `GET /tasks/:id`
- `POST /tasks`
- `PATCH /tasks/:id`
- `GET /workspaces/:id/tasks`
- `GET /providers`
- `GET /artifacts`
- `GET /artifacts/:id`
- `POST /artifacts`
- `GET /terminal/sessions`
- `POST /terminal/sessions`
- `POST /terminal/sessions/:id/input`
- `POST /terminal/sessions/:id/stop`
- `GET /terminal/sessions/:id/output?limit=200`

WebSocket streaming:
- `ws://localhost:3000/v1/stream`
- Send `{"runId":"<optional>","provider":"mock","workspaceId":"<optional>","artifactIds":["<optional>"],"prompt":"hello world"}`
- Stream events: `chat.stream.start`, `chat.stream.delta`, `chat.stream.end`, `chat.stream.error`

Terminal WebSocket:
- `ws://localhost:3000/v1/terminal/stream`
- Send `{"sessionId":"<terminal-session-id>"}` to subscribe
- Stream events: `terminal.backlog`, `terminal.output`, `terminal.exit`

## Providers

Current provider adapters:
- `mock` (default): token-streaming placeholder adapter for development.
- `claude`: Anthropic Messages API adapter.
- `gemini`: Google Generative Language API adapter.
- `chatgpt`: OpenAI Chat Completions adapter.
When `TERMINAL_CONFIRM_REQUIRED=true`, terminal input requests must include:
- `{"input":"<command>","confirm":true}`
