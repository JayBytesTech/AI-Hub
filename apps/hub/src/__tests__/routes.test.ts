import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerRoutes } from "../api/routes.js";
import { TerminalManager } from "../terminal/manager.js";

type WorkspaceRow = { id: string; name: string; root_path: string; created_at: number };
type TaskRow = {
  id: string;
  workspace_id: string;
  title: string;
  status: string;
  due_date: number | null;
  notes: string | null;
  created_at: number;
};

class MockDb {
  workspaces: WorkspaceRow[] = [];
  tasks: TaskRow[] = [];

  prepare(sql: string) {
    if (sql.includes("SELECT * FROM workspaces WHERE id = ?")) {
      return {
        get: (id: string) => this.workspaces.find((row) => row.id === id)
      };
    }
    if (sql.includes("SELECT * FROM workspaces ORDER BY created_at DESC")) {
      return {
        all: () => [...this.workspaces].sort((a, b) => b.created_at - a.created_at)
      };
    }
    if (sql.includes("INSERT INTO workspaces")) {
      return {
        run: (row: WorkspaceRow) => {
          this.workspaces.push(row);
        }
      };
    }
    if (sql.includes("INSERT INTO tasks")) {
      return {
        run: (row: TaskRow) => {
          this.tasks.push(row);
        }
      };
    }
    if (sql.includes("SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC")) {
      return {
        all: (workspaceId: string) =>
          this.tasks
            .filter((row) => row.workspace_id === workspaceId)
            .sort((a, b) => b.created_at - a.created_at)
      };
    }
    if (sql.includes("SELECT * FROM tasks ORDER BY created_at DESC")) {
      return {
        all: () => [...this.tasks].sort((a, b) => b.created_at - a.created_at)
      };
    }

    return {
      all: () => [],
      get: () => undefined,
      run: () => undefined
    };
  }
}

const tempPaths: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-hub-test-"));
  tempPaths.push(dir);
  return dir;
}

async function makeTestApp() {
  const app = Fastify({ logger: false });
  const db = new MockDb();
  const terminalManager = new TerminalManager();
  await registerRoutes(app, db as never, terminalManager);
  return { app, db };
}

afterEach(async () => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("hub routes", () => {
  it("returns health status", async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("creates workspace and linked task", async () => {
    const root = await makeTempDir();
    const { app } = await makeTestApp();

    const wsRes = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "Test WS", rootPath: root }
    });
    expect(wsRes.statusCode).toBe(200);
    const workspace = wsRes.json().data;

    const taskRes = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: { workspaceId: workspace.id, title: "Do thing", status: "todo" }
    });
    expect(taskRes.statusCode).toBe(200);
    expect(taskRes.json().data.workspace_id).toBe(workspace.id);

    const listRes = await app.inject({
      method: "GET",
      url: `/workspaces/${workspace.id}/tasks`
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data).toHaveLength(1);
    await app.close();
  });

  it("rejects non-workspace task creation", async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: { workspaceId: "missing", title: "Invalid", status: "todo" }
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("lists workspace files from root", async () => {
    const root = await makeTempDir();
    await fs.writeFile(path.join(root, "sample.txt"), "hello");
    const { app } = await makeTestApp();

    const wsRes = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "File WS", rootPath: root }
    });
    const workspaceId = wsRes.json().data.id as string;

    const filesRes = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/files`
    });
    expect(filesRes.statusCode).toBe(200);
    const names = (filesRes.json().data.entries as Array<{ name: string }>).map((entry) => entry.name);
    expect(names).toContain("sample.txt");
    await app.close();
  });
});

