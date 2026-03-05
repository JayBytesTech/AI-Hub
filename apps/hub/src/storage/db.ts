import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const storageDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(storageDir, "../../data/hub.db");
const schemaPath = path.resolve(storageDir, "schema.sql");

export function createDb(dbPathArg?: string) {
  const dbPath = dbPathArg ?? process.env.HUB_DB_PATH ?? DEFAULT_DB_PATH;
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const schemaSql = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schemaSql);
  return db;
}

export type Db = ReturnType<typeof createDb>;
