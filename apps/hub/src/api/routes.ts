import type { FastifyInstance } from "fastify";
import type { Db } from "../storage/db.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { listProviders } from "../providers/index.js";
import type { TerminalManager } from "../terminal/manager.js";

type WorkspaceInput = { name: string; rootPath: string };
type ThreadInput = { workspaceId: string; provider: string; title: string };
type TaskInput = {
  workspaceId: string;
  title: string;
  status: string;
  dueDate?: number | null;
  notes?: string | null;
};
type TaskUpdateInput = {
  workspaceId?: string;
  title?: string;
  status?: string;
  dueDate?: number | null;
  notes?: string | null;
};
type ArtifactInput = {
  workspaceId: string;
  threadId?: string | null;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
};
type TerminalSessionInput = { workspaceId: string; shell?: string };
type TerminalInput = { input: string; appendNewline?: boolean; confirm?: boolean };

function newId() {
  return randomUUID();
}

function now() {
  return Date.now();
}

function isWithinRoot(root: string, target: string) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

async function resolveWorkspaceRoot(rootPath: string) {
  const realRoot = await fs.realpath(rootPath);
  const stat = await fs.stat(realRoot);
  if (!stat.isDirectory()) {
    throw new Error("workspace rootPath must be a directory");
  }
  return realRoot;
}

async function resolveWorkspacePath(workspaceRoot: string, requestedPath: string | undefined) {
  const inputPath = requestedPath && requestedPath.length > 0 ? requestedPath : ".";
  const candidate = path.resolve(workspaceRoot, inputPath);
  const realPath = await fs.realpath(candidate);
  if (!isWithinRoot(workspaceRoot, realPath)) {
    throw new Error("path is outside workspace root");
  }
  return realPath;
}

export async function registerRoutes(app: FastifyInstance, db: Db, terminalManager: TerminalManager) {
  const workspaceByIdStmt = db.prepare("SELECT * FROM workspaces WHERE id = ?");

  const getWorkspaceById = (workspaceId: string) => {
    const row = workspaceByIdStmt.get(workspaceId) as
      | { id: string; name: string; root_path: string; created_at: number }
      | undefined;
    return row;
  };

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/providers", async () => ({ data: listProviders() }));

  app.get("/workspaces", async () => {
    const rows = db.prepare("SELECT * FROM workspaces ORDER BY created_at DESC").all();
    return { data: rows };
  });

  app.get<{ Params: { id: string } }>("/workspaces/:id", async (req, reply) => {
    const workspace = getWorkspaceById(req.params.id);
    if (!workspace) {
      return reply.code(404).send({ error: "workspace not found" });
    }
    return { data: workspace };
  });

  app.post<{ Body: WorkspaceInput }>("/workspaces", async (req, reply) => {
    const { name, rootPath } = req.body;
    if (!name || !rootPath) {
      return reply.code(400).send({ error: "name and rootPath are required" });
    }

    let resolvedRootPath: string;
    try {
      resolvedRootPath = await resolveWorkspaceRoot(rootPath);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid workspace rootPath"
      });
    }

    const row = { id: newId(), name, root_path: resolvedRootPath, created_at: now() };
    db.prepare(
      "INSERT INTO workspaces (id, name, root_path, created_at) VALUES (@id, @name, @root_path, @created_at)"
    ).run(row);

    return { data: row };
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/workspaces/:id/files",
    async (req, reply) => {
      const workspace = getWorkspaceById(req.params.id);
      if (!workspace) {
        return reply.code(404).send({ error: "workspace not found" });
      }

      let directoryPath: string;
      try {
        directoryPath = await resolveWorkspacePath(workspace.root_path, req.query.path);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "invalid browse path"
        });
      }

      let entries;
      try {
        entries = await fs.readdir(directoryPath, { withFileTypes: true });
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "failed to list directory"
        });
      }

      const mapped = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(directoryPath, entry.name);
          const stat = await fs.stat(fullPath);
          return {
            name: entry.name,
            path: path.relative(workspace.root_path, fullPath).replaceAll("\\", "/") || ".",
            isDir: entry.isDirectory(),
            size: entry.isFile() ? stat.size : null
          };
        })
      );

      mapped.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
      return {
        data: {
          workspaceId: workspace.id,
          path: path.relative(workspace.root_path, directoryPath).replaceAll("\\", "/") || ".",
          entries: mapped
        }
      };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/workspaces/:id/file",
    async (req, reply) => {
      const workspace = getWorkspaceById(req.params.id);
      if (!workspace) {
        return reply.code(404).send({ error: "workspace not found" });
      }

      if (!req.query.path) {
        return reply.code(400).send({ error: "query param 'path' is required" });
      }

      let filePath: string;
      try {
        filePath = await resolveWorkspacePath(workspace.root_path, req.query.path);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "invalid file path"
        });
      }

      let content: string;
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
          return reply.code(400).send({ error: "path is not a file" });
        }
        content = await fs.readFile(filePath, "utf-8");
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "failed to read file"
        });
      }

      return {
        data: {
          workspaceId: workspace.id,
          path: path.relative(workspace.root_path, filePath).replaceAll("\\", "/"),
          content
        }
      };
    }
  );

  app.get("/threads", async () => {
    const rows = db.prepare("SELECT * FROM threads ORDER BY created_at DESC").all();
    return { data: rows };
  });

  app.post<{ Body: ThreadInput }>("/threads", async (req, reply) => {
    const { workspaceId, provider, title } = req.body;
    if (!workspaceId || !provider || !title) {
      return reply.code(400).send({ error: "workspaceId, provider, and title are required" });
    }

    const row = {
      id: newId(),
      workspace_id: workspaceId,
      provider,
      title,
      created_at: now()
    };

    db.prepare(
      "INSERT INTO threads (id, workspace_id, provider, title, created_at) VALUES (@id, @workspace_id, @provider, @title, @created_at)"
    ).run(row);

    return { data: row };
  });

  app.get<{ Params: { id: string } }>("/threads/:id/messages", async (req) => {
    const rows = db
      .prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
      .all(req.params.id);
    return { data: rows };
  });

  app.get<{ Querystring: { workspaceId?: string; status?: string } }>("/tasks", async (req) => {
    const { workspaceId, status } = req.query;
    if (workspaceId && status) {
      const rows = db
        .prepare("SELECT * FROM tasks WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC")
        .all(workspaceId, status);
      return { data: rows };
    }
    if (workspaceId) {
      const rows = db
        .prepare("SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC")
        .all(workspaceId);
      return { data: rows };
    }
    if (status) {
      const rows = db.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC").all(status);
      return { data: rows };
    }

    const rows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
    return { data: rows };
  });

  app.get<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
    if (!task) {
      return reply.code(404).send({ error: "task not found" });
    }
    return { data: task };
  });

  app.post<{ Body: TaskInput }>("/tasks", async (req, reply) => {
    const { workspaceId, title, status, dueDate = null, notes = null } = req.body;
    if (!workspaceId || !title || !status) {
      return reply.code(400).send({ error: "workspaceId, title, and status are required" });
    }
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      return reply.code(404).send({ error: "workspace not found" });
    }

    const row = {
      id: newId(),
      workspace_id: workspaceId,
      title,
      status,
      due_date: dueDate,
      notes,
      created_at: now()
    };

    db.prepare(
      "INSERT INTO tasks (id, workspace_id, title, status, due_date, notes, created_at) VALUES (@id, @workspace_id, @title, @status, @due_date, @notes, @created_at)"
    ).run(row);

    return { data: row };
  });

  app.patch<{ Params: { id: string }; Body: TaskUpdateInput }>("/tasks/:id", async (req, reply) => {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id) as
      | {
          id: string;
          workspace_id: string;
          title: string;
          status: string;
          due_date: number | null;
          notes: string | null;
          created_at: number;
        }
      | undefined;
    if (!existing) {
      return reply.code(404).send({ error: "task not found" });
    }

    const nextWorkspaceId = req.body.workspaceId ?? existing.workspace_id;
    if (nextWorkspaceId !== existing.workspace_id) {
      const workspace = getWorkspaceById(nextWorkspaceId);
      if (!workspace) {
        return reply.code(404).send({ error: "workspace not found" });
      }
    }

    const row = {
      id: existing.id,
      workspace_id: nextWorkspaceId,
      title: req.body.title ?? existing.title,
      status: req.body.status ?? existing.status,
      due_date: req.body.dueDate === undefined ? existing.due_date : req.body.dueDate,
      notes: req.body.notes === undefined ? existing.notes : req.body.notes
    };

    db.prepare(
      "UPDATE tasks SET workspace_id = @workspace_id, title = @title, status = @status, due_date = @due_date, notes = @notes WHERE id = @id"
    ).run(row);

    return { data: row };
  });

  app.get<{ Params: { id: string } }>("/workspaces/:id/tasks", async (req, reply) => {
    const workspace = getWorkspaceById(req.params.id);
    if (!workspace) {
      return reply.code(404).send({ error: "workspace not found" });
    }

    const rows = db
      .prepare("SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(req.params.id);
    return { data: rows };
  });

  app.get<{ Querystring: { workspaceId?: string; threadId?: string } }>("/artifacts", async (req) => {
    const { workspaceId, threadId } = req.query;

    if (workspaceId && threadId) {
      const rows = db
        .prepare("SELECT * FROM artifacts WHERE workspace_id = ? AND thread_id = ? ORDER BY created_at DESC")
        .all(workspaceId, threadId);
      return { data: rows };
    }
    if (workspaceId) {
      const rows = db
        .prepare("SELECT * FROM artifacts WHERE workspace_id = ? ORDER BY created_at DESC")
        .all(workspaceId);
      return { data: rows };
    }
    if (threadId) {
      const rows = db.prepare("SELECT * FROM artifacts WHERE thread_id = ? ORDER BY created_at DESC").all(threadId);
      return { data: rows };
    }

    const rows = db.prepare("SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 200").all();
    return { data: rows };
  });

  app.get<{ Params: { id: string } }>("/artifacts/:id", async (req, reply) => {
    const artifact = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(req.params.id);
    if (!artifact) {
      return reply.code(404).send({ error: "artifact not found" });
    }
    return { data: artifact };
  });

  app.post<{ Body: ArtifactInput }>("/artifacts", async (req, reply) => {
    const { workspaceId, threadId = null, type, title, content, metadata = null } = req.body;
    if (!workspaceId || !type || !title || !content) {
      return reply.code(400).send({ error: "workspaceId, type, title, and content are required" });
    }

    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      return reply.code(404).send({ error: "workspace not found" });
    }

    const row = {
      id: newId(),
      workspace_id: workspaceId,
      thread_id: threadId,
      type,
      title,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: now()
    };

    db.prepare(
      "INSERT INTO artifacts (id, workspace_id, thread_id, type, title, content, metadata, created_at) VALUES (@id, @workspace_id, @thread_id, @type, @title, @content, @metadata, @created_at)"
    ).run(row);

    return { data: row };
  });

  app.get("/terminal/sessions", async () => {
    return { data: terminalManager.listSessions() };
  });

  app.post<{ Body: TerminalSessionInput }>("/terminal/sessions", async (req, reply) => {
    const { workspaceId, shell } = req.body;
    if (!workspaceId) {
      return reply.code(400).send({ error: "workspaceId is required" });
    }

    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      return reply.code(404).send({ error: "workspace not found" });
    }

    let session;
    try {
      session = terminalManager.createSession({
        workspaceId,
        cwd: workspace.root_path,
        shell
      });
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "failed to start terminal session"
      });
    }

    return { data: session };
  });

  app.post<{ Params: { id: string }; Body: TerminalInput }>(
    "/terminal/sessions/:id/input",
    async (req, reply) => {
      if (!req.body.input && req.body.input !== "") {
        return reply.code(400).send({ error: "input is required" });
      }

      if (terminalConfirmRequired) {
        const command = req.body.input.trim();
        if (command.length > 0 && req.body.confirm !== true) {
          return reply.code(409).send({
            error: "command confirmation required",
            confirmationRequired: true,
            command
          });
        }
      }

      try {
        terminalManager.writeInput(req.params.id, req.body.input, req.body.appendNewline ?? true);
      } catch (error) {
        return reply.code(404).send({
          error: error instanceof Error ? error.message : "failed to write to terminal session"
        });
      }

      return { data: { sessionId: req.params.id, accepted: true } };
    }
  );

  app.post<{ Params: { id: string } }>("/terminal/sessions/:id/stop", async (req, reply) => {
    try {
      terminalManager.stopSession(req.params.id);
    } catch (error) {
      return reply.code(404).send({
        error: error instanceof Error ? error.message : "failed to stop terminal session"
      });
    }

    return { data: { sessionId: req.params.id, stopped: true } };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/terminal/sessions/:id/output",
    async (req, reply) => {
      const rawLimit = Number(req.query.limit ?? 200);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 2000) : 200;

      try {
        const output = terminalManager.getOutput(req.params.id, limit);
        return {
          data: {
            sessionId: req.params.id,
            output
          }
        };
      } catch (error) {
        return reply.code(404).send({
          error: error instanceof Error ? error.message : "failed to fetch terminal output"
        });
      }
    }
  );
}
  const terminalConfirmRequired = (process.env.TERMINAL_CONFIRM_REQUIRED ?? "true") !== "false";
