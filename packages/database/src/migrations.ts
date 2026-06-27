/**
 * 数据库 DDL 建表语句
 * 功能：AgentForge 数据库 schema 定义（SQLite + MySQL）
 */

// ==================== SQLite ====================

export const SQLITE_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_passwords (
  user_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (organization_id, workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS identity_providers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  issuer_url TEXT,
  client_id TEXT,
  client_secret_ref TEXT,
  sso_url TEXT,
  certificate TEXT,
  claim_mapping TEXT,
  group_mapping TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai',
  api_key TEXT NOT NULL,
  base_url TEXT,
  default_model TEXT NOT NULL,
  capabilities TEXT,
  enabled INTEGER DEFAULT 1,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  provider_id TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  fallback_models TEXT,
  fallback_cooldown_seconds INTEGER DEFAULT 900,
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  max_iterations INTEGER DEFAULT 15,
  streaming INTEGER DEFAULT 0,
  thinking INTEGER DEFAULT 0,
  tools TEXT,
  skills TEXT,
  category TEXT NOT NULL DEFAULT '',
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
  workspace_id TEXT,
  agent_id TEXT NOT NULL,
  root_session_id TEXT,
  source_session_id TEXT,
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
  model_trace TEXT,
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
  workspace_id TEXT,
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
  workspace_id TEXT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  method TEXT NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL,
  headers TEXT,
  parameters TEXT,
  body_template TEXT,
  enabled INTEGER DEFAULT 1,
  category TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_categories (
  workspace_id TEXT NOT NULL DEFAULT '',
  skill_name TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
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
  workspace_id TEXT,
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
  workspace_id TEXT,
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
  "CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(organization_id)",
  "CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id)",
  "CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions(token_hash)",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at)",
  "CREATE INDEX IF NOT EXISTS idx_identity_providers_org ON identity_providers(organization_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created ON audit_logs(workspace_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)",
  "CREATE INDEX IF NOT EXISTS idx_providers_workspace ON providers(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_usage_logs_workspace ON usage_logs(workspace_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_http_tools_workspace ON http_tools(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_knowledge_bases_workspace ON knowledge_bases(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_provider_channels_workspace ON provider_channels(workspace_id)",
  "CREATE INDEX IF NOT EXISTS idx_proxy_usage_workspace ON proxy_usage_logs(workspace_id, created_at)",
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
  "CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category)",
  "CREATE INDEX IF NOT EXISTS idx_http_tools_category ON http_tools(category)",
  "CREATE INDEX IF NOT EXISTS idx_skill_categories_category ON skill_categories(category)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_root ON sessions(root_session_id)",
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
  {
    name: "add_categories_fallbacks_and_session_family",
    up: [
      "ALTER TABLE agents ADD COLUMN category TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE agents ADD COLUMN fallback_models TEXT",
      "ALTER TABLE agents ADD COLUMN fallback_cooldown_seconds INTEGER DEFAULT 900",
      "ALTER TABLE http_tools ADD COLUMN category TEXT NOT NULL DEFAULT ''",
      `CREATE TABLE IF NOT EXISTS skill_categories (skill_name TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`,
      "ALTER TABLE sessions ADD COLUMN root_session_id TEXT",
      "ALTER TABLE sessions ADD COLUMN source_session_id TEXT",
    ],
  },
  {
    name: "add_message_model_trace",
    up: [
      "ALTER TABLE messages ADD COLUMN model_trace TEXT",
    ],
  },
  {
    name: "add_provider_capabilities",
    up: [
      "ALTER TABLE providers ADD COLUMN capabilities TEXT",
    ],
  },
  {
    name: "add_tenant_foundation",
    up: [
      `CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE (organization_id, slug))`,
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, avatar_url TEXT, last_login_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS memberships (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, workspace_id TEXT, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE (organization_id, workspace_id, user_id))`,
      `CREATE TABLE IF NOT EXISTS identity_providers (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, type TEXT NOT NULL, provider TEXT NOT NULL, name TEXT NOT NULL, issuer_url TEXT, client_id TEXT, client_secret_ref TEXT, sso_url TEXT, certificate TEXT, claim_mapping TEXT, group_mapping TEXT, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, workspace_id TEXT, actor_user_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, metadata TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    ],
  },
  {
    name: "add_workspace_scope",
    up: [
      "ALTER TABLE providers ADD COLUMN workspace_id TEXT",
      "ALTER TABLE agents ADD COLUMN workspace_id TEXT",
      "ALTER TABLE sessions ADD COLUMN workspace_id TEXT",
      "ALTER TABLE usage_logs ADD COLUMN workspace_id TEXT",
      "ALTER TABLE http_tools ADD COLUMN workspace_id TEXT",
      "ALTER TABLE knowledge_bases ADD COLUMN workspace_id TEXT",
      "ALTER TABLE provider_channels ADD COLUMN workspace_id TEXT",
      "ALTER TABLE proxy_usage_logs ADD COLUMN workspace_id TEXT",
      `CREATE TABLE IF NOT EXISTS workspace_skill_categories (workspace_id TEXT NOT NULL, skill_name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (workspace_id, skill_name))`,
    ],
  },
  {
    name: "add_local_auth_tables",
    up: [
      `CREATE TABLE IF NOT EXISTS user_passwords (user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), last_seen_at TEXT DEFAULT (datetime('now')))`,
    ],
  },
];

// ==================== MySQL ====================

export const MYSQL_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE KEY idx_workspaces_org_slug (organization_id, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_passwords (
  user_id VARCHAR(36) PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  last_seen_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS memberships (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  workspace_id VARCHAR(36),
  user_id VARCHAR(36) NOT NULL,
  role VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY idx_memberships_scope_user (organization_id, workspace_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS identity_providers (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  type VARCHAR(40) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  issuer_url TEXT,
  client_id TEXT,
  client_secret_ref TEXT,
  sso_url TEXT,
  certificate TEXT,
  claim_mapping JSON,
  group_mapping JSON,
  enabled TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  workspace_id VARCHAR(36),
  actor_user_id VARCHAR(36),
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(120) NOT NULL,
  resource_id VARCHAR(255),
  metadata JSON,
  ip_address VARCHAR(80),
  user_agent TEXT,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'openai',
  api_key TEXT NOT NULL,
  base_url TEXT,
  default_model VARCHAR(255) NOT NULL,
  capabilities JSON,
  enabled TINYINT(1) DEFAULT 1,
  is_primary TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  system_prompt LONGTEXT NOT NULL,
  provider_id VARCHAR(36),
  model VARCHAR(255) NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  fallback_models JSON,
  fallback_cooldown_seconds INT DEFAULT 900,
  temperature DOUBLE DEFAULT 0.7,
  max_tokens INT DEFAULT 4096,
  max_iterations INT DEFAULT 15,
  streaming TINYINT(1) DEFAULT 0,
  thinking TINYINT(1) DEFAULT 0,
  tools JSON,
  skills JSON,
  category VARCHAR(100) NOT NULL DEFAULT '',
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
  workspace_id VARCHAR(36),
  agent_id VARCHAR(36) NOT NULL,
  root_session_id VARCHAR(36),
  source_session_id VARCHAR(36),
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
  model_trace LONGTEXT,
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
  workspace_id VARCHAR(36),
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
  workspace_id VARCHAR(36),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  method VARCHAR(10) NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL,
  headers JSON,
  parameters JSON,
  body_template TEXT,
  enabled TINYINT(1) DEFAULT 1,
  category VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS skill_categories (
  workspace_id VARCHAR(36) NOT NULL DEFAULT '',
  skill_name VARCHAR(255) PRIMARY KEY,
  category VARCHAR(100) NOT NULL DEFAULT '',
  updated_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36),
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
  workspace_id VARCHAR(36),
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
  workspace_id VARCHAR(36),
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
  "CREATE INDEX idx_workspaces_org ON workspaces(organization_id)",
  "CREATE INDEX idx_memberships_org ON memberships(organization_id)",
  "CREATE INDEX idx_memberships_workspace ON memberships(workspace_id)",
  "CREATE INDEX idx_memberships_user ON memberships(user_id)",
  "CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id)",
  "CREATE INDEX idx_auth_sessions_hash ON auth_sessions(token_hash)",
  "CREATE INDEX idx_auth_sessions_expires ON auth_sessions(expires_at)",
  "CREATE INDEX idx_identity_providers_org ON identity_providers(organization_id)",
  "CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id, created_at)",
  "CREATE INDEX idx_audit_logs_workspace_created ON audit_logs(workspace_id, created_at)",
  "CREATE INDEX idx_api_keys_hash ON api_keys(key_hash)",
  "CREATE INDEX idx_providers_workspace ON providers(workspace_id)",
  "CREATE INDEX idx_agents_workspace ON agents(workspace_id)",
  "CREATE INDEX idx_sessions_workspace ON sessions(workspace_id)",
  "CREATE INDEX idx_usage_logs_workspace ON usage_logs(workspace_id, created_at)",
  "CREATE INDEX idx_http_tools_workspace ON http_tools(workspace_id)",
  "CREATE INDEX idx_knowledge_bases_workspace ON knowledge_bases(workspace_id)",
  "CREATE INDEX idx_provider_channels_workspace ON provider_channels(workspace_id)",
  "CREATE INDEX idx_proxy_usage_workspace ON proxy_usage_logs(workspace_id, created_at)",
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
  "CREATE INDEX idx_agents_category ON agents(category)",
  "CREATE INDEX idx_http_tools_category ON http_tools(category)",
  "CREATE INDEX idx_skill_categories_category ON skill_categories(category)",
  "CREATE INDEX idx_sessions_root ON sessions(root_session_id)",
];

export const MYSQL_ALTERS = [
  "ALTER TABLE agents ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT ''",
  "ALTER TABLE agents ADD COLUMN fallback_models JSON",
  "ALTER TABLE agents ADD COLUMN fallback_cooldown_seconds INT DEFAULT 900",
  "ALTER TABLE http_tools ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT ''",
  "CREATE TABLE IF NOT EXISTS skill_categories (skill_name VARCHAR(255) PRIMARY KEY, category VARCHAR(100) NOT NULL DEFAULT '', updated_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "ALTER TABLE sessions ADD COLUMN root_session_id VARCHAR(36)",
  "ALTER TABLE sessions ADD COLUMN source_session_id VARCHAR(36)",
  "ALTER TABLE messages ADD COLUMN model_trace LONGTEXT",
  "ALTER TABLE providers ADD COLUMN capabilities JSON",
  "CREATE TABLE IF NOT EXISTS organizations (id VARCHAR(36) PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(100) NOT NULL UNIQUE, created_at DATETIME DEFAULT NOW(), updated_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS workspaces (id VARCHAR(36) PRIMARY KEY, organization_id VARCHAR(36) NOT NULL, name VARCHAR(255) NOT NULL, slug VARCHAR(100) NOT NULL, created_at DATETIME DEFAULT NOW(), updated_at DATETIME DEFAULT NOW(), UNIQUE KEY idx_workspaces_org_slug (organization_id, slug)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS users (id VARCHAR(36) PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE, display_name VARCHAR(255) NOT NULL, avatar_url TEXT, last_login_at DATETIME, created_at DATETIME DEFAULT NOW(), updated_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS memberships (id VARCHAR(36) PRIMARY KEY, organization_id VARCHAR(36) NOT NULL, workspace_id VARCHAR(36), user_id VARCHAR(36) NOT NULL, role VARCHAR(40) NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'active', created_at DATETIME DEFAULT NOW(), updated_at DATETIME DEFAULT NOW(), UNIQUE KEY idx_memberships_scope_user (organization_id, workspace_id, user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS identity_providers (id VARCHAR(36) PRIMARY KEY, organization_id VARCHAR(36) NOT NULL, type VARCHAR(40) NOT NULL, provider VARCHAR(80) NOT NULL, name VARCHAR(255) NOT NULL, issuer_url TEXT, client_id TEXT, client_secret_ref TEXT, sso_url TEXT, certificate TEXT, claim_mapping JSON, group_mapping JSON, enabled TINYINT(1) DEFAULT 1, created_at DATETIME DEFAULT NOW(), updated_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS audit_logs (id VARCHAR(36) PRIMARY KEY, organization_id VARCHAR(36) NOT NULL, workspace_id VARCHAR(36), actor_user_id VARCHAR(36), action VARCHAR(120) NOT NULL, resource_type VARCHAR(120) NOT NULL, resource_id VARCHAR(255), metadata JSON, ip_address VARCHAR(80), user_agent TEXT, created_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "ALTER TABLE providers ADD COLUMN workspace_id VARCHAR(36)",
  "ALTER TABLE agents ADD COLUMN workspace_id VARCHAR(36)",
  "ALTER TABLE sessions ADD COLUMN workspace_id VARCHAR(36)",
  "ALTER TABLE usage_logs ADD COLUMN workspace_id VARCHAR(36)",
  "ALTER TABLE http_tools ADD COLUMN workspace_id VARCHAR(36)",
  "ALTER TABLE knowledge_bases ADD COLUMN workspace_id VARCHAR(36)",
  "ALTER TABLE provider_channels ADD COLUMN workspace_id VARCHAR(36)",
  "ALTER TABLE proxy_usage_logs ADD COLUMN workspace_id VARCHAR(36)",
  "CREATE TABLE IF NOT EXISTS workspace_skill_categories (workspace_id VARCHAR(36) NOT NULL, skill_name VARCHAR(255) NOT NULL, category VARCHAR(100) NOT NULL DEFAULT '', updated_at DATETIME DEFAULT NOW(), PRIMARY KEY (workspace_id, skill_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS user_passwords (user_id VARCHAR(36) PRIMARY KEY, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT NOW(), updated_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  "CREATE TABLE IF NOT EXISTS auth_sessions (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, created_at DATETIME DEFAULT NOW(), last_seen_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
