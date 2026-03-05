# Repository Guidelines

## Project Structure & Module Organization
This repository is currently a planning and starter-spec workspace for AI Hub. Key top-level artifacts include:
- `PRD.md`, `Architecture_Diagram.md`, `Repo_Structure.md` for product and system design.
- `Hub_OpenAPI_Spec.yaml`, `JSON_Schemas.md`, `Tool_RPC_Protocol.md` for API and protocol contracts.
- `hub_server_example.ts` and `rust_tools_runner_example.rs` as implementation references.

Target implementation layout (from `Repo_Structure.md`):
- `apps/desktop` for Tauri UI.
- `apps/hub` for the TypeScript API/WebSocket server.
- `crates/tools-runner` for Rust tool execution.
- `packages/shared/schemas` for shared contracts.

## Build, Test, and Development Commands
No workspace is scaffolded yet, so use these as baseline commands once directories are created:
- `pnpm install` - install monorepo dependencies.
- `pnpm --filter hub dev` - run the hub server locally (expected at `http://localhost:3000`).
- `pnpm --filter desktop dev` - run the Tauri desktop app in development mode.
- `cargo run -p tools-runner` - run the Rust tools runner.
- `pnpm -r test` and `cargo test --all` - execute JS/TS and Rust tests.

## Coding Style & Naming Conventions
- TypeScript: 2-space indentation, semicolons optional but consistent, `camelCase` for variables/functions, `PascalCase` for types/components.
- Rust: `rustfmt` defaults (4 spaces), `snake_case` for functions/modules, `PascalCase` for structs/enums.
- Keep API/schema names stable and explicit (example: `chat.stream.delta` event type).
- Prefer small modules by domain (`api/`, `providers/`, `storage/`, `tools/`).

## Testing Guidelines
- Place TS tests next to source or under `__tests__/` with `*.test.ts`.
- Place Rust tests inline (`mod tests`) or in `crates/tools-runner/tests/`.
- Add tests for protocol/schema changes and endpoint behavior (`/health`, `/workspaces`, `/threads`, `/tasks`).
- Minimum expectation: new logic ships with at least one unit/integration test path.

## Commit & Pull Request Guidelines
Git history is not available in this workspace snapshot, so adopt Conventional Commits:
- Example: `feat(hub): add workspace list endpoint`
- Example: `fix(runner): handle invalid JSON tool payload`

PRs should include:
- Clear summary of scope and affected modules.
- Linked issue/task reference.
- Validation evidence (test output or manual verification steps).
- UI screenshots for desktop changes and API examples for contract updates.

## Security & Configuration Tips
- Do not commit secrets or provider keys; use local env files (for example, `.env.local`).
- Validate tool input/output against shared schemas before execution.
- Keep filesystem and shell operations sandboxed and explicitly confirmed where required.
