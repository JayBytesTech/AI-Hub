import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./api/routes.js";
import { registerWs } from "./api/ws.js";
import { getHubConfig } from "./config.js";
import { hubMetrics } from "./observability/metrics.js";
import { createDb } from "./storage/db.js";
import { TerminalManager } from "./terminal/manager.js";

type BuildAppOptions = {
  dbPath?: string;
  logger?: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    traceId: string;
    traceStartedAt: number;
  }
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = getHubConfig();
  const app = Fastify({ logger: options.logger ?? true });
  const db = createDb(options.dbPath ?? config.storage.dbPath);
  const terminalManager = new TerminalManager();

  app.addHook("onRequest", async (req, reply) => {
    const requestIdHeader = req.headers["x-request-id"];
    const traceId =
      typeof requestIdHeader === "string" && requestIdHeader.trim().length > 0
        ? requestIdHeader.trim()
        : randomUUID();
    req.traceId = traceId;
    req.traceStartedAt = Date.now();
    reply.header("x-request-id", traceId);
  });

  app.addHook("onResponse", async (req, reply) => {
    const durationMs = Date.now() - req.traceStartedAt;
    const route = req.routeOptions.url ?? req.url;
    const statusCode = String(reply.statusCode);

    hubMetrics.increment("http_requests_total", {
      method: req.method,
      route,
      statusCode
    });
    hubMetrics.observe("http_request_duration_ms", durationMs, {
      method: req.method,
      route
    });

    req.log.info(
      {
        event: "http.response",
        traceId: req.traceId,
        method: req.method,
        route,
        statusCode: reply.statusCode,
        durationMs
      },
      "http request completed"
    );
  });

  app.addHook("onClose", async () => {
    db.close();
  });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  await app.register(
    async (v1) => {
      await registerRoutes(v1, db, terminalManager);
      await registerWs(v1, terminalManager, db);
    },
    { prefix: "/v1" }
  );

  return app;
}
