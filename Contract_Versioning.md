# API And WS Contract Versioning Policy

This repository treats API and WebSocket contracts as stable public interfaces.

## Contract Scope

Versioned contracts include:
- Hub REST responses under `/v1/*`
- Hub WebSocket event payloads
- Shared JSON schemas in `packages/shared/schemas/schemas/*`

## Versioning Rules

- Additive, backward-compatible changes:
  - Add optional fields only
  - Add new endpoints/events without changing existing payload meaning
  - Keep major version (`v1`) unchanged
- Breaking changes:
  - Remove fields, rename fields, change field types, or tighten required fields
  - Change semantics of existing event types
  - Require new params for existing endpoints
  - Must introduce a new API version path (for example `/v2`) and new schemas

## Enforcement

- Shared schemas are source-of-truth for response/event shapes.
- Contract tests in `apps/hub/src/__tests__/contracts.test.ts` must pass.
- CI must run these tests on every PR.

## Change Process

1. Update or add schema files in `packages/shared/schemas/schemas/`.
2. Update contract tests to validate live responses/events.
3. For breaking changes, create new versioned routes/schemas instead of modifying `v1`.
