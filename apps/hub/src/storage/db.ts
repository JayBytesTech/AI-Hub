import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { getHubConfig } from "../config.js";

const storageDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(storageDir, "../../data/hub.db");
const hubRoot = path.resolve(storageDir, "../..");

type RetentionPolicy = {
  artifactsDays: number;
  terminalAuditDays: number;
};

function resolveMigrationsDir() {
  const candidates = [
    path.resolve(storageDir, "migrations"),
    path.resolve(hubRoot, "src/storage/migrations"),
    path.resolve(hubRoot, "dist/storage/migrations")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not locate migrations directory. Checked: ${candidates.join(", ")}`);
}

function ensureMigrationTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

function runMigrations(db: Database.Database) {
  ensureMigrationTable(db);
  const migrationsDir = resolveMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const hasMigrationStmt = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ? LIMIT 1");
  const markMigrationStmt = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)");

  for (const file of files) {
    const applied = hasMigrationStmt.get(file) as { 1: number } | undefined;
    if (applied) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const tx = db.transaction(() => {
      db.exec(sql);
      markMigrationStmt.run(file, Date.now());
    });
    tx();
  }
}

export function runRetentionCleanup(db: Database.Database, policy: RetentionPolicy, nowMs = Date.now()) {
  if (policy.artifactsDays > 0) {
    const cutoff = nowMs - policy.artifactsDays * 24 * 60 * 60 * 1000;
    db.prepare("DELETE FROM artifacts WHERE created_at < ?").run(cutoff);
  }
  if (policy.terminalAuditDays > 0) {
    const cutoff = nowMs - policy.terminalAuditDays * 24 * 60 * 60 * 1000;
    db.prepare("DELETE FROM terminal_audit_logs WHERE created_at < ?").run(cutoff);
  }
}

export function createDb(dbPathArg?: string) {
  const config = getHubConfig();
  const dbPath = dbPathArg ?? config.storage.dbPath ?? DEFAULT_DB_PATH;
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  runRetentionCleanup(db, config.storage.retention);
  return db;
}

export type Db = ReturnType<typeof createDb>;
