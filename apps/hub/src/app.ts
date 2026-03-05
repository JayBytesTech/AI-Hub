import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./api/routes.js";
import { registerWs } from "./api/ws.js";
import { createDb } from "./storage/db.js";
import { TerminalManager } from "./terminal/manager.js";

type BuildAppOptions = {
  dbPath?: string;
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  const db = createDb(options.dbPath);
  const terminalManager = new TerminalManager();

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

