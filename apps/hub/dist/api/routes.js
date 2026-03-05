import { randomUUID } from "node:crypto";
import { listProviders } from "../providers/index.js";
function newId() {
    return randomUUID();
}
function now() {
    return Date.now();
}
export async function registerRoutes(app, db) {
    app.get("/health", async () => ({ status: "ok" }));
    app.get("/providers", async () => ({ data: listProviders() }));
    app.get("/workspaces", async () => {
        const rows = db.prepare("SELECT * FROM workspaces ORDER BY created_at DESC").all();
        return { data: rows };
    });
    app.post("/workspaces", async (req, reply) => {
        const { name, rootPath } = req.body;
        if (!name || !rootPath) {
            return reply.code(400).send({ error: "name and rootPath are required" });
        }
        const row = { id: newId(), name, root_path: rootPath, created_at: now() };
        db.prepare("INSERT INTO workspaces (id, name, root_path, created_at) VALUES (@id, @name, @root_path, @created_at)").run(row);
        return { data: row };
    });
    app.get("/threads", async () => {
        const rows = db.prepare("SELECT * FROM threads ORDER BY created_at DESC").all();
        return { data: rows };
    });
    app.post("/threads", async (req, reply) => {
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
        db.prepare("INSERT INTO threads (id, workspace_id, provider, title, created_at) VALUES (@id, @workspace_id, @provider, @title, @created_at)").run(row);
        return { data: row };
    });
    app.get("/threads/:id/messages", async (req) => {
        const rows = db
            .prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
            .all(req.params.id);
        return { data: rows };
    });
    app.get("/tasks", async () => {
        const rows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
        return { data: rows };
    });
    app.post("/tasks", async (req, reply) => {
        const { workspaceId, title, status, dueDate = null, notes = null } = req.body;
        if (!workspaceId || !title || !status) {
            return reply.code(400).send({ error: "workspaceId, title, and status are required" });
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
        db.prepare("INSERT INTO tasks (id, workspace_id, title, status, due_date, notes, created_at) VALUES (@id, @workspace_id, @title, @status, @due_date, @notes, @created_at)").run(row);
        return { data: row };
    });
}
