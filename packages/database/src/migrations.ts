/**
 * 数据库 DDL 建表语句
 * 功能：AgentForge 数据库 schema 定义（SQLite + MySQL）
 */

// ==================== SQLite ====================

export const SQLITE_MIGRATIONS = `
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

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  provider_id TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  max_iterations INTEGER DEFAULT 15,
  streaming INTEGER DEFAULT 0,
  thinking INTEGER DEFAULT 0,
  tools TEXT,
  skills TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT DEFAULT 'default',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking TEXT,
  model TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  tool_calls TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  model TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS http_tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  method TEXT NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL,
  headers TEXT,
  parameters TEXT,
  body_template TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_knowledge (
  agent_id TEXT NOT NULL,
  kb_id TEXT NOT NULL,
  PRIMARY KEY (agent_id, kb_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  UNIQUE (kb_id, source_name)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_channels (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS proxy_usage_logs (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (channel_id) REFERENCES provider_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);
`;

export const SQLITE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)",
  "CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, role, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_usage_logs_agent ON usage_logs(agent_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model)",
  "CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb ON knowledge_chunks(kb_id)",
  "CREATE INDEX IF NOT EXISTS idx_provider_channels_hash ON provider_channels(key_hash)",
  "CREATE INDEX IF NOT EXISTS idx_provider_channels_provider ON provider_channels(provider_id)",
  "CREATE INDEX IF NOT EXISTS idx_proxy_usage_channel ON proxy_usage_logs(channel_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_proxy_usage_provider ON proxy_usage_logs(provider_id, created_at)",
];

export const SQLITE_INCREMENTAL_MIGRATIONS = [
  {
    name: "add_thinking_column",
    up: [
      "ALTER TABLE agents ADD COLUMN thinking INTEGER DEFAULT 0",
      "ALTER TABLE messages ADD COLUMN thinking TEXT",
    ],
  },
  {
    name: "add_cache_read_tokens",
    up: [
      "ALTER TABLE messages ADD COLUMN cache_read_tokens INTEGER DEFAULT 0",
    ],
  },
  {
    name: "add_knowledge_bases_tables",
    up: [
      `CREATE TABLE IF NOT EXISTS knowledge_bases (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT, updated_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS agent_knowledge (agent_id TEXT NOT NULL, kb_id TEXT NOT NULL, PRIMARY KEY (agent_id, kb_id))`,
      `CREATE TABLE IF NOT EXISTS knowledge_sources (id TEXT PRIMARY KEY, kb_id TEXT NOT NULL, source_name TEXT NOT NULL, raw_content TEXT NOT NULL, created_at TEXT, updated_at TEXT, UNIQUE (kb_id, source_name))`,
    ],
  },
  {
    name: "add_kb_id_to_knowledge_chunks",
    up: [
      "ALTER TABLE knowledge_chunks ADD COLUMN kb_id TEXT",
    ],
  },
  {
    name: "add_provider_channels_tables",
    up: [
      `CREATE TABLE IF NOT EXISTS provider_channels (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL, key_prefix TEXT NOT NULL, enabled INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS proxy_usage_logs (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, provider_id TEXT NOT NULL, model TEXT NOT NULL, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0, created_at TEXT)`,
    ],
  },
];

// ==================== MySQL ====================

export const MYSQL_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'openai',
  api_key TEXT NOT NULL,
  base_url TEXT,
  default_model VARCHAR(255) NOT NULL,
  enabled TINYINT(1) DEFAULT 1,
  is_primary TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  system_prompt LONGTEXT NOT NULL,
  provider_id VARCHAR(36),
  model VARCHAR(255) NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature DOUBLE DEFAULT 0.7,
  max_tokens INT DEFAULT 4096,
  max_iterations INT DEFAULT 15,
  streaming TINYINT(1) DEFAULT 0,
  thinking TINYINT(1) DEFAULT 0,
  tools JSON,
  skills JSON,
  enabled TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  key_hash VARCHAR(64) NOT NULL,
  key_prefix VARCHAR(10) NOT NULL,
  name VARCHAR(255) DEFAULT 'default',
  enabled TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  last_used_at DATETIME,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content LONGTEXT NOT NULL,
  thinking LONGTEXT,
  model VARCHAR(255),
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  cache_read_tokens INT DEFAULT 0,
  duration_ms INT DEFAULT 0,
  tool_calls TEXT,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usage_logs (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  tokens_in INT NOT NULL,
  tokens_out INT NOT NULL,
  model VARCHAR(255) NOT NULL,
  duration_ms INT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS http_tools (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  method VARCHAR(10) NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL,
  headers JSON,
  parameters JSON,
  body_template TEXT,
  enabled TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_knowledge (
  agent_id VARCHAR(36) NOT NULL,
  kb_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (agent_id, kb_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id VARCHAR(36) PRIMARY KEY,
  kb_id VARCHAR(36) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  raw_content LONGTEXT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  UNIQUE KEY idx_ks_kb_name (kb_id, source_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id VARCHAR(36) PRIMARY KEY,
  kb_id VARCHAR(36) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  chunk_index INT NOT NULL,
  content LONGTEXT NOT NULL,
  embedding LONGBLOB,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS provider_channels (
  id VARCHAR(36) PRIMARY KEY,
  provider_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(64) NOT NULL,
  key_prefix VARCHAR(10) NOT NULL,
  enabled TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proxy_usage_logs (
  id VARCHAR(36) PRIMARY KEY,
  channel_id VARCHAR(36) NOT NULL,
  provider_id VARCHAR(36) NOT NULL,
  model VARCHAR(255) NOT NULL,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (channel_id) REFERENCES provider_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

export const MYSQL_INDEXES = [
  "CREATE INDEX idx_api_keys_hash ON api_keys(key_hash)",
  "CREATE INDEX idx_sessions_agent ON sessions(agent_id)",
  "CREATE INDEX idx_sessions_updated ON sessions(updated_at)",
  "CREATE INDEX idx_sessions_created ON sessions(created_at)",
  "CREATE INDEX idx_messages_session ON messages(session_id)",
  "CREATE INDEX idx_messages_session_role ON messages(session_id, role, created_at)",
  "CREATE INDEX idx_usage_logs_agent ON usage_logs(agent_id, created_at)",
  "CREATE INDEX idx_usage_logs_model ON usage_logs(model)",
  "CREATE INDEX idx_usage_logs_created ON usage_logs(created_at)",
  "CREATE INDEX idx_knowledge_chunks_kb ON knowledge_chunks(kb_id)",
  "CREATE INDEX idx_provider_channels_hash ON provider_channels(key_hash)",
  "CREATE INDEX idx_provider_channels_provider ON provider_channels(provider_id)",
  "CREATE INDEX idx_proxy_usage_channel ON proxy_usage_logs(channel_id, created_at)",
  "CREATE INDEX idx_proxy_usage_provider ON proxy_usage_logs(provider_id, created_at)",
];
