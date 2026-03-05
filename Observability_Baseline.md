# Observability Baseline

## What Is Implemented

- Structured HTTP request completion logs from the hub:
  - `event`, `traceId`, `method`, `route`, `statusCode`, `durationMs`
- `x-request-id` propagation:
  - incoming `x-request-id` is honored
  - generated when missing
  - always echoed in response headers
- WebSocket chat stream logs:
  - stream start, completion, and error records with `runId` and provider context
- In-memory metrics endpoint:
  - `GET /v1/metrics`
  - includes counters and histogram-like aggregates

## Core Metrics

Current metrics include:
- `http_requests_total` (by method/route/statusCode)
- `http_request_duration_ms` (by method/route)
- `ws_chat_stream_total` (by provider/outcome/errorCode)
- `ws_chat_stream_duration_ms` (by provider)

## Correlation IDs

- Use `x-request-id` for HTTP calls.
- Use `runId` for WebSocket chat streams.
- Use `sessionId` for terminal stream/audit events.

## Next Improvements

1. Export metrics in Prometheus text format for external scraping.
2. Add periodic snapshot logging for key counters.
3. Add request/stream span IDs for deeper trace trees.
