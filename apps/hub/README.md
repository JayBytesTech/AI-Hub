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
- `HUB_PROFILE` (one of `development`, `test`, `production`; default from `NODE_ENV` or `development`)
- `HUB_DB_PATH` (default `apps/hub/data/hub.db`)
- `HUB_ENABLED_PROVIDERS` (comma-separated; default `mock,claude,gemini,chatgpt`)
- `HUB_REQUIRE_PROVIDER_SECRETS` (default `true` in `production`, else `false`)
- `TERMINAL_CONFIRM_REQUIRED` (default `true`)
- `ANTHROPIC_API_KEY` (required for `claude`)
- `CLAUDE_MODEL` (default `claude-3-5-sonnet-latest`)
- `GEMINI_API_KEY` (required for `gemini`)
- `GEMINI_MODEL` (default `gemini-1.5-flash`)
- `OPENAI_API_KEY` (required for `chatgpt`)
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `PROVIDER_REQUEST_TIMEOUT_MS` (default `20000`)
- `PROVIDER_REQUEST_RETRIES` (default `2`)
- `PROVIDER_RETRY_BASE_DELAY_MS` (default `300`)
- `PROVIDER_CIRCUIT_FAILURE_THRESHOLD` (default `3`)
- `PROVIDER_CIRCUIT_COOLDOWN_MS` (default `30000`)
- `HUB_WORKSPACE_ALLOWED_ROOTS` (optional comma-separated absolute roots)
- `TERMINAL_BLOCKLIST_PATTERNS` (optional comma-separated regex patterns)
- `HUB_RETENTION_ARTIFACT_DAYS` (default `0`, disabled)
- `HUB_RETENTION_TERMINAL_AUDIT_DAYS` (default `0`, disabled)

## API

Base URL: `http://localhost:3000/v1`

- `GET /health`
- `GET /metrics`
- `GET /workspaces`
- `GET /security/policy`
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
- `GET /terminal/audit?workspaceId=&sessionId=&status=&eventType=&limit=200`
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
Enabled providers are controlled by `HUB_ENABLED_PROVIDERS`.
When `TERMINAL_CONFIRM_REQUIRED=true`, terminal input requests must include:
- `{"input":"<command>","confirm":true}`

## Observability

- HTTP responses include `x-request-id`.
- Send your own `x-request-id` header to correlate client and hub logs.
- Metrics snapshot endpoint:
  - `GET /v1/metrics`

## Storage Migrations

Schema changes are managed through versioned SQL files:
- `src/storage/migrations/*.sql`

On startup, the hub applies pending migrations and records them in `schema_migrations`.
