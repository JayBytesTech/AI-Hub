# Desktop App

React + Vite frontend hosted inside a Tauri shell.

## Run (web only)

```bash
pnpm install
pnpm --filter @ai-hub/desktop dev
```

## Run (Tauri desktop)

```bash
pnpm --filter @ai-hub/desktop tauri:dev
```

## Hub connection

Set optional env vars in `apps/desktop/.env`:
- `VITE_HUB_HTTP_BASE=http://localhost:3000/v1`
- `VITE_HUB_WS_BASE=ws://localhost:3000/v1/stream`

The current UI includes:
- Provider list from `GET /providers`
- Hub health indicator from `GET /health`
- Chat composer + streamed assistant responses over WebSocket
