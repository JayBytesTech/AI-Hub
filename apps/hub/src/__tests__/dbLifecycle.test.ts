import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb, runRetentionCleanup } from "../storage/db.js";

const tempPaths: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-hub-db-life-"));
  tempPaths.push(dir);
  return dir;
}

afterEach(async () => {
  delete process.env.HUB_RETENTION_ARTIFACT_DAYS;
  delete process.env.HUB_RETENTION_TERMINAL_AUDIT_DAYS;

  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("db lifecycle", () => {
  it("applies migrations and records migration history", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "hub.db");
    const db = createDb(dbPath);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((row) => row.name);
    expect(tableNames).toContain("schema_migrations");
    expect(tableNames).toContain("workspaces");
    expect(tableNames).toContain("terminal_audit_logs");

    const migrations = db
      .prepare("SELECT id FROM schema_migrations ORDER BY id ASC")
      .all() as Array<{ id: string }>;
    expect(migrations.map((row) => row.id)).toEqual(["001_initial.sql", "002_terminal_audit.sql"]);
    db.close();
  });

  it("prunes artifacts and audit logs with retention policy", async () => {
    process.env.HUB_RETENTION_ARTIFACT_DAYS = "7";
    process.env.HUB_RETENTION_TERMINAL_AUDIT_DAYS = "7";

    const dir = await makeTempDir();
    const dbPath = path.join(dir, "hub.db");
    const db = createDb(dbPath);

    const now = Date.now();
    const oldTs = now - 10 * 24 * 60 * 60 * 1000;
    const newTs = now - 1 * 24 * 60 * 60 * 1000;

    db.prepare(
      "INSERT INTO artifacts (id, workspace_id, thread_id, type, title, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("a-old", "ws", null, "note", "Old", "old", null, oldTs);
    db.prepare(
      "INSERT INTO artifacts (id, workspace_id, thread_id, type, title, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("a-new", "ws", null, "note", "New", "new", null, newTs);

    db.prepare(
      "INSERT INTO terminal_audit_logs (id, session_id, workspace_id, event_type, status, actor, command, confirmation_required, confirmed, append_newline, exit_code, signal, error, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "t-old",
      "s1",
      "ws",
      "command_input",
      "accepted",
      "tester",
      "echo old",
      1,
      1,
      1,
      0,
      null,
      null,
      null,
      oldTs
    );
    db.prepare(
      "INSERT INTO terminal_audit_logs (id, session_id, workspace_id, event_type, status, actor, command, confirmation_required, confirmed, append_newline, exit_code, signal, error, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "t-new",
      "s1",
      "ws",
      "command_input",
      "accepted",
      "tester",
      "echo new",
      1,
      1,
      1,
      0,
      null,
      null,
      null,
      newTs
    );

    runRetentionCleanup(db, now);

    const artifactIds = (
      db.prepare("SELECT id FROM artifacts ORDER BY id ASC").all() as Array<{ id: string }>
    ).map((row) => row.id);
    const auditIds = (
      db.prepare("SELECT id FROM terminal_audit_logs ORDER BY id ASC").all() as Array<{ id: string }>
    ).map((row) => row.id);

    expect(artifactIds).toEqual(["a-new"]);
    expect(auditIds).toEqual(["t-new"]);
    db.close();
  });
});
