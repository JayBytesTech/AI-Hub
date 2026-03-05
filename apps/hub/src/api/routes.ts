import type { FastifyInstance } from "fastify";
import type { Db } from "../storage/db.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getHubConfig } from "../config.js";
import { hubMetrics } from "../observability/metrics.js";
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
type TerminalAuditQuery = {
  workspaceId?: string;
  sessionId?: string;
  status?: string;
  eventType?: string;
  limit?: string;
};

type SecurityPolicy = {
  terminalConfirmRequired: boolean;
  workspaceAllowedRoots: string[];
  terminalBlockedPatterns: RegExp[];
};

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
  const config = getHubConfig();
  const securityPolicy: SecurityPolicy = {
    terminalConfirmRequired: config.security.terminalConfirmRequired,
    workspaceAllowedRoots: config.security.workspaceAllowedRoots.map((root) => path.resolve(root)),
    terminalBlockedPatterns: config.security.terminalBlockedPatterns
      .map((pattern) => {
        try {
          return new RegExp(pattern, "i");
        } catch {
          return null;
        }
      })
      .filter((pattern): pattern is RegExp => pattern !== null)
  };
  const workspaceByIdStmt = db.prepare("SELECT * FROM workspaces WHERE id = ?");
  const insertTerminalAuditStmt = db.prepare(
    "INSERT INTO terminal_audit_logs (id, session_id, workspace_id, event_type, status, actor, command, confirmation_required, confirmed, append_newline, exit_code, signal, error, metadata, created_at) VALUES (@id, @session_id, @workspace_id, @event_type, @status, @actor, @command, @confirmation_required, @confirmed, @append_newline, @exit_code, @signal, @error, @metadata, @created_at)"
  );

  const getWorkspaceById = (workspaceId: string) => {
    const row = workspaceByIdStmt.get(workspaceId) as
      | { id: string; name: string; root_path: string; created_at: number }
      | undefined;
    return row;
  };

  const getRequestActor = (rawActor: unknown) => {
    if (typeof rawActor !== "string") {
      return "local-user";
    }
    const trimmed = rawActor.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 120) : "local-user";
  };

  const isWorkspaceRootAllowed = (resolvedRootPath: string) => {
    if (securityPolicy.workspaceAllowedRoots.length === 0) {
      return true;
    }
    return securityPolicy.workspaceAllowedRoots.some((allowedRoot) =>
      isWithinRoot(allowedRoot, resolvedRootPath)
    );
  };

  const getBlockedPattern = (command: string) => {
    for (const pattern of securityPolicy.terminalBlockedPatterns) {
      if (pattern.test(command)) {
        return pattern.source;
      }
    }
    return null;
  };

  const writeTerminalAudit = (row: {
    sessionId: string;
    workspaceId: string;
    eventType: string;
    status: string;
    actor?: string;
    command?: string | null;
    confirmationRequired?: boolean | null;
    confirmed?: boolean | null;
    appendNewline?: boolean | null;
    exitCode?: number | null;
    signal?: string | null;
    error?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    insertTerminalAuditStmt.run({
      id: newId(),
      session_id: row.sessionId,
      workspace_id: row.workspaceId,
      event_type: row.eventType,
      status: row.status,
      actor: row.actor ?? "system",
      command: row.command ?? null,
      confirmation_required:
        row.confirmationRequired === undefined || row.confirmationRequired === null
          ? null
          : Number(row.confirmationRequired),
      confirmed:
        row.confirmed === undefined || row.confirmed === null ? null : Number(row.confirmed),
      append_newline:
        row.appendNewline === undefined || row.appendNewline === null ? null : Number(row.appendNewline),
      exit_code: row.exitCode ?? null,
      signal: row.signal ?? null,
      error: row.error ?? null,
      metadata: row.metadata ? JSON.stringify(row.metadata) : null,
      created_at: now()
    });
  };

  const unsubscribeTerminalAudit = terminalManager.subscribe((event) => {
    if (event.type === "terminal.start") {
      writeTerminalAudit({
        sessionId: event.sessionId,
        workspaceId: event.workspaceId,
        eventType: "session_start",
        status: "accepted",
        actor: "system"
      });
      return;
    }

    if (event.type === "terminal.exit") {
      writeTerminalAudit({
        sessionId: event.sessionId,
        workspaceId: event.workspaceId,
        eventType: "session_exit",
        status: "accepted",
        actor: "system",
        exitCode: event.code,
        signal: event.signal
      });
    }
  });

  app.addHook("onClose", async () => {
    unsubscribeTerminalAudit();
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/providers", async () => ({ data: listProviders() }));
  app.get("/metrics", async () => ({ data: hubMetrics.snapshot() }));
  app.get("/security/policy", async () => ({
    data: {
      terminalConfirmRequired: securityPolicy.terminalConfirmRequired,
      workspaceAllowedRoots: securityPolicy.workspaceAllowedRoots,
      terminalBlockedPatterns: securityPolicy.terminalBlockedPatterns.map((pattern) => pattern.source)
    }
  }));

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
    if (!isWorkspaceRootAllowed(resolvedRootPath)) {
      return reply.code(403).send({
        error: "workspace rootPath is outside allowed roots",
        allowedRoots: securityPolicy.workspaceAllowedRoots
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

  app.get<{ Querystring: TerminalAuditQuery }>("/terminal/audit", async (req) => {
    const rawLimit = Number(req.query.limit ?? 200);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 2000) : 200;

    const whereClauses: string[] = [];
    const params: Array<string | number> = [];

    if (req.query.workspaceId) {
      whereClauses.push("workspace_id = ?");
      params.push(req.query.workspaceId);
    }
    if (req.query.sessionId) {
      whereClauses.push("session_id = ?");
      params.push(req.query.sessionId);
    }
    if (req.query.status) {
      whereClauses.push("status = ?");
      params.push(req.query.status);
    }
    if (req.query.eventType) {
      whereClauses.push("event_type = ?");
      params.push(req.query.eventType);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT * FROM terminal_audit_logs ${whereSql} ORDER BY created_at DESC LIMIT ?`
      )
      .all(...params, limit) as Array<{
      id: string;
      session_id: string;
      workspace_id: string;
      event_type: string;
      status: string;
      actor: string;
      command: string | null;
      confirmation_required: number | null;
      confirmed: number | null;
      append_newline: number | null;
      exit_code: number | null;
      signal: string | null;
      error: string | null;
      metadata: string | null;
      created_at: number;
    }>;

    return {
      data: rows.map((row) => ({
        ...row,
        metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null
      }))
    };
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

    writeTerminalAudit({
      sessionId: session.id,
      workspaceId,
      eventType: "session_start_request",
      status: "accepted",
      actor: getRequestActor(req.headers["x-aihub-actor"]),
      metadata: {
        shell: session.shell,
        cwd: session.cwd
      }
    });

    return { data: session };
  });

  app.post<{ Params: { id: string }; Body: TerminalInput }>(
    "/terminal/sessions/:id/input",
    async (req, reply) => {
      const session = terminalManager.getSession(req.params.id);
      if (!session) {
        return reply.code(404).send({ error: "terminal session not found" });
      }

      const actor = getRequestActor(req.headers["x-aihub-actor"]);
      const appendNewline = req.body.appendNewline ?? true;

      if (!req.body.input && req.body.input !== "") {
        return reply.code(400).send({ error: "input is required" });
      }

      const command = req.body.input.trim();
      if (command.length > 0) {
        const blockedPattern = getBlockedPattern(command);
        if (blockedPattern) {
          writeTerminalAudit({
            sessionId: session.id,
            workspaceId: session.workspaceId,
            eventType: "command_blocked",
            status: "rejected",
            actor,
            command: req.body.input,
            confirmationRequired: securityPolicy.terminalConfirmRequired,
            confirmed: req.body.confirm === true,
            appendNewline,
            error: "command blocked by terminal policy",
            metadata: { blockedPattern }
          });
          return reply.code(403).send({
            error: "command blocked by terminal policy",
            blocked: true
          });
        }
      }

      if (securityPolicy.terminalConfirmRequired) {
        if (command.length > 0 && req.body.confirm !== true) {
          writeTerminalAudit({
            sessionId: session.id,
            workspaceId: session.workspaceId,
            eventType: "command_rejected",
            status: "rejected",
            actor,
            command: req.body.input,
            confirmationRequired: true,
            confirmed: false,
            appendNewline,
            error: "command confirmation required"
          });
          return reply.code(409).send({
            error: "command confirmation required",
            confirmationRequired: true,
            command
          });
        }
      }

      try {
        terminalManager.writeInput(req.params.id, req.body.input, appendNewline);
        writeTerminalAudit({
          sessionId: session.id,
          workspaceId: session.workspaceId,
          eventType: "command_input",
          status: "accepted",
          actor,
          command: req.body.input,
          confirmationRequired: securityPolicy.terminalConfirmRequired && command.length > 0,
          confirmed: req.body.confirm === true,
          appendNewline
        });
      } catch (error) {
        writeTerminalAudit({
          sessionId: session.id,
          workspaceId: session.workspaceId,
          eventType: "command_input",
          status: "error",
          actor,
          command: req.body.input,
          confirmationRequired: securityPolicy.terminalConfirmRequired && command.length > 0,
          confirmed: req.body.confirm === true,
          appendNewline,
          error: error instanceof Error ? error.message : "failed to write to terminal session"
        });
        return reply.code(404).send({
          error: error instanceof Error ? error.message : "failed to write to terminal session"
        });
      }

      return { data: { sessionId: req.params.id, accepted: true } };
    }
  );

  app.post<{ Params: { id: string } }>("/terminal/sessions/:id/stop", async (req, reply) => {
    const session = terminalManager.getSession(req.params.id);
    if (!session) {
      return reply.code(404).send({ error: "terminal session not found" });
    }

    const actor = getRequestActor(req.headers["x-aihub-actor"]);

    try {
      terminalManager.stopSession(req.params.id);
      writeTerminalAudit({
        sessionId: session.id,
        workspaceId: session.workspaceId,
        eventType: "session_stop_request",
        status: "accepted",
        actor
      });
    } catch (error) {
      writeTerminalAudit({
        sessionId: session.id,
        workspaceId: session.workspaceId,
        eventType: "session_stop_request",
        status: "error",
        actor,
        error: error instanceof Error ? error.message : "failed to stop terminal session"
      });
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
