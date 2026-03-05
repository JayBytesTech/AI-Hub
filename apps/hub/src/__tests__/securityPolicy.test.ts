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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-hub-security-"));
  tempPaths.push(dir);
  return dir;
}

afterEach(async () => {
  delete process.env.HUB_WORKSPACE_ALLOWED_ROOTS;
  delete process.env.TERMINAL_BLOCKLIST_PATTERNS;

  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("security policy", () => {
  it("enforces workspace allowed roots", async () => {
    const allowedRoot = await makeTempDir();
    const insideDir = path.join(allowedRoot, "inside");
    const outsideDir = await makeTempDir();
    await fs.mkdir(insideDir, { recursive: true });

    process.env.HUB_WORKSPACE_ALLOWED_ROOTS = allowedRoot;

    const app = Fastify({ logger: false });
    const db = createDb(":memory:");
    const terminalManager = new TerminalManager();
    await registerRoutes(app, db, terminalManager);

    const allowedRes = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "Inside", rootPath: insideDir }
    });
    expect(allowedRes.statusCode).toBe(200);

    const deniedRes = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "Outside", rootPath: outsideDir }
    });
    expect(deniedRes.statusCode).toBe(403);
    expect(deniedRes.json().error).toContain("outside allowed roots");

    await app.close();
    db.close();
  });

  it("blocks terminal commands matching policy patterns and audits rejection", async () => {
    process.env.TERMINAL_BLOCKLIST_PATTERNS = "rm\\s+-rf,shutdown";

    const workspaceRoot = await makeTempDir();
    const app = Fastify({ logger: false });
    const db = createDb(":memory:");
    const terminalManager = new TerminalManager();
    await registerRoutes(app, db, terminalManager);

    const wsRes = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "Sec WS", rootPath: workspaceRoot }
    });
    const workspaceId = wsRes.json().data.id as string;

    const sessionRes = await app.inject({
      method: "POST",
      url: "/terminal/sessions",
      payload: { workspaceId, shell: "bash" }
    });
    const sessionId = sessionRes.json().data.id as string;

    const blockedRes = await app.inject({
      method: "POST",
      url: `/terminal/sessions/${sessionId}/input`,
      payload: { input: "rm -rf ./tmp", confirm: true }
    });
    expect(blockedRes.statusCode).toBe(403);
    expect(blockedRes.json().blocked).toBe(true);

    const auditRes = await app.inject({
      method: "GET",
      url: `/terminal/audit?sessionId=${encodeURIComponent(sessionId)}&eventType=command_blocked`
    });
    expect(auditRes.statusCode).toBe(200);
    const rows = auditRes.json().data as Array<{ event_type: string; status: string; metadata: unknown }>;
    expect(rows.some((row) => row.event_type === "command_blocked" && row.status === "rejected")).toBe(true);

    await app.inject({ method: "POST", url: `/terminal/sessions/${sessionId}/stop` });
    await app.close();
    db.close();
  });
});
