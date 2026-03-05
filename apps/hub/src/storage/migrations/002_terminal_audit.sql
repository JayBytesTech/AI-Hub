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
