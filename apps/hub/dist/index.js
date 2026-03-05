import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./api/routes.js";
import { registerWs } from "./api/ws.js";
import { createDb } from "./storage/db.js";
const app = Fastify({ logger: true });
const port = Number(process.env.HUB_PORT ?? 3000);
const host = process.env.HUB_HOST ?? "0.0.0.0";
const db = createDb();
await app.register(cors, { origin: true });
await app.register(websocket);
await app.register(async (v1) => {
    await registerRoutes(v1, db);
    await registerWs(v1);
}, { prefix: "/v1" });
try {
    await app.listen({ port, host });
}
catch (error) {
    app.log.error(error);
    process.exit(1);
}
