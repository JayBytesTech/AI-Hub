
# SQLite Database Schema

CREATE TABLE workspaces (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 root_path TEXT NOT NULL,
 created_at INTEGER
);

CREATE TABLE threads (
 id TEXT PRIMARY KEY,
 workspace_id TEXT,
 provider TEXT,
 title TEXT,
 created_at INTEGER
);

CREATE TABLE messages (
 id TEXT PRIMARY KEY,
 thread_id TEXT,
 role TEXT,
 content TEXT,
 created_at INTEGER
);

CREATE TABLE artifacts (
 id TEXT PRIMARY KEY,
 workspace_id TEXT,
 type TEXT,
 content TEXT,
 metadata TEXT,
 created_at INTEGER
);

CREATE TABLE tasks (
 id TEXT PRIMARY KEY,
 workspace_id TEXT,
 title TEXT,
 status TEXT,
 due_date INTEGER,
 notes TEXT,
 created_at INTEGER
);
