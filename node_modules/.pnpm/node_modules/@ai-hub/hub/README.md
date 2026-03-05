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

## API

Base URL: `http://localhost:3000/v1`

- `GET /health`
- `GET /workspaces`
- `POST /workspaces`
- `GET /threads`
- `POST /threads`
- `GET /threads/:id/messages`
- `GET /tasks`
- `POST /tasks`
- `GET /providers`

WebSocket streaming:
- `ws://localhost:3000/v1/stream`
- Send `{"runId":"<optional>","provider":"mock","prompt":"hello world"}`
- Stream events: `chat.stream.start`, `chat.stream.delta`, `chat.stream.end`, `chat.stream.error`

## Providers

Current provider adapters:
- `mock` (default): token-streaming placeholder adapter for development.
