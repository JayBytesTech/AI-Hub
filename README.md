# AI Hub Starter Repository

AI Hub is a monorepo for a local-first AI workstation.

Core components:
- Desktop app (React + Vite + Tauri)
- Hub server (TypeScript + Fastify)
- Tools runner (Rust)
- Shared schemas package

## Fresh Clone To Running App

1. Install prerequisites:
   - Node 22+
   - pnpm (via `corepack`)
   - Rust toolchain (`cargo`, `rustc`)
2. Enable corepack:
   - `corepack enable`
3. Install dependencies:
   - `pnpm setup`
4. Create env files:
   - `cp apps/hub/.env.example apps/hub/.env`
   - `cp apps/desktop/.env.example apps/desktop/.env`
5. Start hub + desktop web dev servers together:
   - `pnpm dev`

Default dev endpoints:
- Hub HTTP: `http://localhost:3000/v1`
- Hub WS stream: `ws://localhost:3000/v1/stream`
- Desktop web UI: `http://localhost:1420`

## Scripts

- `pnpm dev`: run hub + desktop dev servers in parallel
- `pnpm verify`: lint + build + test (JS workspaces) + Rust tests
- `pnpm lint`: lint all JS/TS workspaces
- `pnpm build`: build all JS/TS workspaces
- `pnpm test`: test all JS/TS workspaces
- `pnpm package:desktop`: build and package the Tauri desktop app with bundled hub/runner resources

## Contract Stability

- API/WS contract policy: `Contract_Versioning.md`
- Shared contract schemas: `packages/shared/schemas/schemas/`

## Security

- Security model and trust boundaries: `Security_Model.md`
