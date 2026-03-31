// Incremental migrations for existing databases
export const INCREMENTAL_MIGRATIONS = [
  // Add provider_id to agents and create providers table
  {
    name: "add_providers",
    up: [
      `CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'openai',
        api_key TEXT NOT NULL, base_url TEXT, default_model TEXT NOT NULL,
        enabled INTEGER DEFAULT 1, is_primary INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `ALTER TABLE agents ADD COLUMN provider_id TEXT`,
    ],
  },
  {
    name: "add_cache_tokens",
    up: [
      `ALTER TABLE messages ADD COLUMN cache_read_tokens INTEGER DEFAULT 0`,
    ],
  },
  {
    name: "add_chunk_embedding",
    up: [
      `ALTER TABLE knowledge_chunks ADD COLUMN embedding BLOB`,
    ],
  },
];

export const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  max_iterations INTEGER DEFAULT 15,
  streaming INTEGER DEFAULT 0,
  tools TEXT DEFAULT '[]',
  skills TEXT DEFAULT '[]',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT DEFAULT 'default',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  tool_calls TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  model TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai',
  api_key TEXT NOT NULL,
  base_url TEXT,
  default_model TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS http_tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  method TEXT NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL,
  headers TEXT DEFAULT '{}',
  parameters TEXT DEFAULT '{}',
  body_template TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, role, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_agent ON usage_logs(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_agent ON knowledge_chunks(agent_id);
`;
