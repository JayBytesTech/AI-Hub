import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { registerRoutes } from "../api/routes.js";
import { createDb } from "../storage/db.js";
import { TerminalManager, type TerminalEvent } from "../terminal/manager.js";

const tempPaths: string[] = [];
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default as new (options?: Record<string, unknown>) => {
  compile: (
    schema: Record<string, unknown>
  ) => ((payload: unknown) => boolean) & { errors?: unknown };
  errors?: unknown;
};

function schemaUrl(name: string) {
  return new URL(`../../../../packages/shared/schemas/schemas/${name}`, import.meta.url);
}

async function loadSchema(name: string) {
  const raw = await fs.readFile(schemaUrl(name), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-hub-contract-"));
  tempPaths.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("hub API contracts", () => {
  it("GET /health matches shared schema", async () => {
    const app = await buildApp({ dbPath: ":memory:", logger: false });
    const schema = await loadSchema("hub-health-response.schema.json");
    const validate = new Ajv2020({ strict: false }).compile(schema);

    const res = await app.inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);

    const payload = res.json();
    expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
    await app.close();
  });

  it("GET /providers matches shared schema", async () => {
    const app = await buildApp({ dbPath: ":memory:", logger: false });
    const schema = await loadSchema("hub-providers-response.schema.json");
    const validate = new Ajv2020({ strict: false }).compile(schema);

    const res = await app.inject({ method: "GET", url: "/v1/providers" });
    expect(res.statusCode).toBe(200);

    const payload = res.json();
    expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
    await app.close();
  });

  it("GET /terminal/audit matches shared schema", async () => {
    const app = Fastify({ logger: false });
    const db = createDb(":memory:");
    const terminalManager = new TerminalManager();
    await registerRoutes(app, db, terminalManager);

    const workspaceRoot = await makeTempDir();
    const wsRes = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "Contract WS", rootPath: workspaceRoot }
    });
    const workspaceId = wsRes.json().data.id as string;

    const sessionRes = await app.inject({
      method: "POST",
      url: "/terminal/sessions",
      payload: { workspaceId, shell: "bash" }
    });
    const sessionId = sessionRes.json().data.id as string;

    await app.inject({
      method: "POST",
      url: `/terminal/sessions/${sessionId}/input`,
      payload: { input: "echo contract", confirm: true }
    });
    await app.inject({ method: "POST", url: `/terminal/sessions/${sessionId}/stop` });
    await new Promise((resolve) => setTimeout(resolve, 40));

    const schema = await loadSchema("hub-terminal-audit-response.schema.json");
    const validate = new Ajv2020({ strict: false }).compile(schema);
    const res = await app.inject({
      method: "GET",
      url: `/terminal/audit?sessionId=${encodeURIComponent(sessionId)}`
    });
    expect(res.statusCode).toBe(200);

    const payload = res.json();
    expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);

    await app.close();
    db.close();
  });
});

describe("hub websocket event contracts", () => {
  it("terminal manager emitted events match shared WS schema", async () => {
    const terminalManager = new TerminalManager();
    const wsSchema = await loadSchema("hub-ws-event.schema.json");
    const validate = new Ajv2020({ strict: false }).compile(wsSchema);

    const workspaceRoot = await makeTempDir();
    const events: TerminalEvent[] = [];
    const unsubscribe = terminalManager.subscribe((event) => {
      events.push(event);
    });

    const session = terminalManager.createSession({
      workspaceId: "ws-contract-workspace",
      cwd: workspaceRoot,
      shell: "bash"
    });

    terminalManager.writeInput(session.id, "echo ws-contract", true);
    terminalManager.stopSession(session.id);
    await new Promise((resolve) => setTimeout(resolve, 50));
    unsubscribe();

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(validate(event), `event failed schema: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it("chat stream event shapes match shared WS schema", async () => {
    const wsSchema = await loadSchema("hub-ws-event.schema.json");
    const validate = new Ajv2020({ strict: false }).compile(wsSchema);

    const runId = "contract-run";
    const events = [
      { type: "chat.stream.start", runId, provider: "mock" },
      { type: "chat.stream.delta", runId, content: "hello" },
      { type: "chat.stream.end", runId },
      {
        type: "chat.stream.error",
        runId,
        error: "provider failed",
        errorCode: "upstream_error",
        retryable: true,
        statusCode: 503,
        provider: "chatgpt"
      }
    ];

    for (const event of events) {
      expect(validate(event), `event failed schema: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });
});
