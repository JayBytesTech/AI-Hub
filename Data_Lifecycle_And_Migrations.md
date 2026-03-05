# Data Lifecycle And Migrations

## Migration Strategy

The hub uses versioned SQL migrations under:
- `apps/hub/src/storage/migrations/`

Current migration files:
- `001_initial.sql`
- `002_terminal_audit.sql`

At startup, the hub:
1. Ensures `schema_migrations` exists.
2. Applies pending migration files in lexical order.
3. Records applied migration IDs in `schema_migrations`.

## Migration Rules

- Never edit an already-applied migration in place.
- Add new incremental migration files for schema changes.
- Keep migration files idempotent (`IF NOT EXISTS` where possible).

## Retention Policy

Optional retention cleanup runs on startup and can be run in-process:
- `HUB_RETENTION_ARTIFACT_DAYS` (default `0`, disabled)
- `HUB_RETENTION_TERMINAL_AUDIT_DAYS` (default `0`, disabled)

When enabled, records older than the configured age are deleted from:
- `artifacts`
- `terminal_audit_logs`

## Operational Guidance

- Start with retention disabled in development.
- Enable retention in longer-lived environments to bound data growth.
- Validate retention settings before production rollouts.
