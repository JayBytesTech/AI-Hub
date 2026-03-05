# Config And Environment Profiles

## Profile Selection

Hub profile is selected in this order:
1. `HUB_PROFILE`
2. `NODE_ENV`
3. default `development`

Supported profiles:
- `development`
- `test`
- `production`

## Core Rules

- Configuration is parsed and validated through `apps/hub/src/config.ts`.
- Invalid provider names in `HUB_ENABLED_PROVIDERS` fail fast.
- Provider secret checks on startup are controlled by:
  - `HUB_REQUIRE_PROVIDER_SECRETS`
  - default behavior: `true` in `production`, `false` otherwise

## Key Variables

- `HUB_PROFILE`
- `HUB_HOST`, `HUB_PORT`, `HUB_DB_PATH`
- `HUB_ENABLED_PROVIDERS`
- `HUB_REQUIRE_PROVIDER_SECRETS`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- Security: `TERMINAL_CONFIRM_REQUIRED`, `HUB_WORKSPACE_ALLOWED_ROOTS`, `TERMINAL_BLOCKLIST_PATTERNS`
- Reliability: `PROVIDER_REQUEST_TIMEOUT_MS`, `PROVIDER_REQUEST_RETRIES`, `PROVIDER_RETRY_BASE_DELAY_MS`, `PROVIDER_CIRCUIT_FAILURE_THRESHOLD`, `PROVIDER_CIRCUIT_COOLDOWN_MS`
- Retention: `HUB_RETENTION_ARTIFACT_DAYS`, `HUB_RETENTION_TERMINAL_AUDIT_DAYS`

## Recommended Defaults

- Development:
  - include `mock` in enabled providers
  - `HUB_REQUIRE_PROVIDER_SECRETS=false`
- Test:
  - keep deterministic provider/terminal settings in test setup
- Production:
  - explicit `HUB_ENABLED_PROVIDERS`
  - `HUB_REQUIRE_PROVIDER_SECRETS=true`
  - set provider keys for enabled non-mock providers
