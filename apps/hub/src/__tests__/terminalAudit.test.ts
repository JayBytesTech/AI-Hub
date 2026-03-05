import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerRoutes } from "../api/routes.js";
import { createDb } from "../storage/db.js";
import { TerminalManager } from "../terminal/manager.js";

const tempPaths: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-hub-term-audit-"));
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

describe("terminal audit", () => {
  it("records rejected commands when confirmation is missing", async () => {
    const app = Fastify({ logger: false });
    const db = createDb(":memory:");
    const terminalManager = new TerminalManager();
    await registerRoutes(app, db, terminalManager);

    const workspaceRoot = await makeTempDir();
    const wsRes = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "Audit WS", rootPath: workspaceRoot }
    });
    const workspaceId = wsRes.json().data.id as string;

    const sessionRes = await app.inject({
      method: "POST",
      url: "/terminal/sessions",
      payload: { workspaceId, shell: "bash" }
    });
    const sessionId = sessionRes.json().data.id as string;

    const inputRes = await app.inject({
      method: "POST",
      url: `/terminal/sessions/${sessionId}/input`,
      payload: { input: "echo hello" },
      headers: { "x-aihub-actor": "qa-user" }
    });
    expect(inputRes.statusCode).toBe(409);

    const auditRes = await app.inject({
      method: "GET",
      url: `/terminal/audit?sessionId=${encodeURIComponent(sessionId)}`
    });
    expect(auditRes.statusCode).toBe(200);
    const rows = auditRes.json().data as Array<{
      event_type: string;
      status: string;
      actor: string;
      command: string | null;
      confirmation_required: number | null;
      confirmed: number | null;
    }>;

    const rejected = rows.find((row) => row.event_type === "command_rejected");
    expect(rejected).toBeDefined();
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.actor).toBe("qa-user");
    expect(rejected?.command).toBe("echo hello");
    expect(rejected?.confirmation_required).toBe(1);
    expect(rejected?.confirmed).toBe(0);

    await app.inject({ method: "POST", url: `/terminal/sessions/${sessionId}/stop` });
    await app.close();
    db.close();
  });

  it("records accepted input and stop requests", async () => {
    const app = Fastify({ logger: false });
    const db = createDb(":memory:");
    const terminalManager = new TerminalManager();
    await registerRoutes(app, db, terminalManager);

    const workspaceRoot = await makeTempDir();
    const wsRes = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "Audit WS", rootPath: workspaceRoot }
    });
    const workspaceId = wsRes.json().data.id as string;

    const sessionRes = await app.inject({
      method: "POST",
      url: "/terminal/sessions",
      payload: { workspaceId, shell: "bash" }
    });
    const sessionId = sessionRes.json().data.id as string;

    const inputRes = await app.inject({
      method: "POST",
      url: `/terminal/sessions/${sessionId}/input`,
      payload: { input: "echo ok", confirm: true },
      headers: { "x-aihub-actor": "qa-user" }
    });
    expect(inputRes.statusCode).toBe(200);

    const stopRes = await app.inject({
      method: "POST",
      url: `/terminal/sessions/${sessionId}/stop`,
      headers: { "x-aihub-actor": "qa-user" }
    });
    expect(stopRes.statusCode).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 40));

    const auditRes = await app.inject({
      method: "GET",
      url: `/terminal/audit?sessionId=${encodeURIComponent(sessionId)}&limit=100`
    });
    expect(auditRes.statusCode).toBe(200);
    const rows = auditRes.json().data as Array<{
      event_type: string;
      status: string;
      exit_code: number | null;
      actor: string;
    }>;

    expect(rows.some((row) => row.event_type === "command_input" && row.status === "accepted")).toBe(true);
    expect(rows.some((row) => row.event_type === "session_stop_request" && row.status === "accepted")).toBe(true);
    expect(rows.some((row) => row.event_type === "session_exit" && row.status === "accepted")).toBe(true);

    const exitRow = rows.find((row) => row.event_type === "session_exit");
    expect(exitRow?.exit_code === null || typeof exitRow?.exit_code === "number").toBe(true);

    await app.close();
    db.close();
  });
});
