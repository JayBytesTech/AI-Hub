import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "apps/hub/data/hub.db");
const schemaPath = path.resolve(process.cwd(), "apps/hub/src/storage/schema.sql");

export function createDb() {
  const dbPath = process.env.HUB_DB_PATH ?? DEFAULT_DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const schemaSql = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schemaSql);
  return db;
}

export type Db = ReturnType<typeof createDb>;

