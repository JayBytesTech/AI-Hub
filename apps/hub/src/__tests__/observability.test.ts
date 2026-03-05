import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { hubMetrics } from "../observability/metrics.js";

afterEach(() => {
  hubMetrics.resetForTests();
});

describe("observability baseline", () => {
  it("echoes x-request-id and exposes metrics", async () => {
    const app = await buildApp({ dbPath: ":memory:", logger: false });

    const requestId = "req-observe-1";
    const healthRes = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: {
        "x-request-id": requestId
      }
    });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.headers["x-request-id"]).toBe(requestId);

    const metricsRes = await app.inject({ method: "GET", url: "/v1/metrics" });
    expect(metricsRes.statusCode).toBe(200);
    expect(metricsRes.headers["x-request-id"]).toBeTypeOf("string");

    const metrics = metricsRes.json().data as {
      counters: Array<{ name: string; labels: Record<string, string>; value: number }>;
      histograms: Array<{ name: string; labels: Record<string, string>; count: number; avg: number }>;
    };

    const healthCounter = metrics.counters.find(
      (item) =>
        item.name === "http_requests_total" &&
        typeof item.labels.route === "string" &&
        item.labels.route.includes("health")
    );
    expect(healthCounter?.value).toBeGreaterThan(0);

    const durationMetric = metrics.histograms.find(
      (item) =>
        item.name === "http_request_duration_ms" &&
        typeof item.labels.route === "string" &&
        item.labels.route.includes("health")
    );
    expect(durationMetric?.count).toBeGreaterThan(0);
    expect(durationMetric?.avg).toBeGreaterThanOrEqual(0);

    await app.close();
  });
});
