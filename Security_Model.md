# AI Hub Security Model

## Scope

This model covers the local desktop deployment path:
- Desktop app (Tauri UI)
- Hub server (TypeScript/Fastify)
- Terminal execution and workspace filesystem access
- External AI provider API calls

## Trust Boundaries

1. UI boundary:
   - User input from desktop UI and API clients is untrusted.
2. Hub boundary:
   - Hub validates and enforces policy before any local execution.
3. Workspace boundary:
   - File reads are constrained to registered workspace root paths.
4. Terminal boundary:
   - Commands are high-risk and require explicit policy checks.
5. Provider boundary:
   - Upstream provider responses are untrusted network data.

## Threat Model

Primary threats:
- Path traversal outside workspace roots.
- Dangerous shell command execution.
- Silent policy bypass via configuration drift.
- Runtime instability from upstream provider failures.
- Poor post-incident forensics due to missing audit data.

## Enforced Controls

### Workspace controls

- Workspace file access enforces in-root path checks.
- Optional workspace root allowlist:
  - `HUB_WORKSPACE_ALLOWED_ROOTS` (comma-separated absolute roots)
  - Workspace registration outside allowed roots is rejected.

### Terminal controls

- Command confirmation gate:
  - `TERMINAL_CONFIRM_REQUIRED=true` by default.
- Optional command blocklist:
  - `TERMINAL_BLOCKLIST_PATTERNS` regex list.
  - Matching commands are rejected before execution.
- Terminal audit logging:
  - Accepted/rejected commands, session lifecycle, actor, status, metadata.

### Provider runtime controls

- Timeout/retry/circuit-breaker protections around provider API calls.
- Standardized stream error payloads include code/retryability/provider context.

## Operational Notes

- Policy is loaded from environment at hub startup.
- Effective policy can be inspected via `GET /v1/security/policy`.
- Contract and policy behavior are covered by tests:
  - `apps/hub/src/__tests__/contracts.test.ts`
  - `apps/hub/src/__tests__/terminalAudit.test.ts`
  - `apps/hub/src/__tests__/securityPolicy.test.ts`

## Next Security Steps

1. Add authn/authz model for multi-user or remote clients.
2. Add signed, tamper-evident audit log export.
3. Add explicit terminal allowlist mode for stricter deployments.
4. Add redaction policy for secrets in terminal output artifacts.
