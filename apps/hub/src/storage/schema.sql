CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS terminal_audit_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  actor TEXT NOT NULL,
  command TEXT,
  confirmation_required INTEGER,
  confirmed INTEGER,
  append_newline INTEGER,
  exit_code INTEGER,
  signal TEXT,
  error TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_terminal_audit_workspace_created
  ON terminal_audit_logs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_audit_session_created
  ON terminal_audit_logs (session_id, created_at DESC);
