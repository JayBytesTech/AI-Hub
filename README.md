
# AI Hub Starter Repository

This repository contains the base structure for the AI Hub project.

Components:
- Desktop app (Tauri)
- TypeScript hub server
- Rust tools runner
- Shared schemas

Start development by running the hub server and desktop client in dev mode.

Packaging command:
- `pnpm package:desktop`
  - Builds hub server bundle
  - Builds Rust tools runner release binary
  - Bundles desktop app with hub resources and runner sidecar
