/**
 * PostgreSQL schema definitions for AgentForge.
 */

export const POSTGRES_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  last_login_at TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS user_passwords (
  user_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  last_seen_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_id TEXT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
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
  temperature DOUBLE PRECISION DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  max_iterations INTEGER DEFAULT 15,
  streaming INTEGER DEFAULT 0,
  thinking INTEGER DEFAULT 0,
  tools TEXT,
  skills TEXT,
  category TEXT NOT NULL DEFAULT '',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT DEFAULT 'default',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  last_used_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  agent_id TEXT NOT NULL,
  root_session_id TEXT,
  source_session_id TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS skill_categories (
  workspace_id TEXT NOT NULL DEFAULT '',
  skill_name TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  UNIQUE (kb_id, source_name)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BYTEA,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  FOREIGN KEY (channel_id) REFERENCES provider_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);
`;

export const POSTGRES_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_hash ON auth_sessions(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_identity_providers_org ON identity_providers(organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created ON audit_logs(workspace_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_providers_workspace ON providers(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_logs_workspace ON usage_logs(workspace_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_http_tools_workspace ON http_tools(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_bases_workspace ON knowledge_bases(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_provider_channels_workspace ON provider_channels(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_proxy_usage_workspace ON proxy_usage_logs(workspace_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_session_role ON messages(session_id, role, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_logs_agent ON usage_logs(agent_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb ON knowledge_chunks(kb_id)`,
  `CREATE INDEX IF NOT EXISTS idx_provider_channels_hash ON provider_channels(key_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_provider_channels_provider ON provider_channels(provider_id)`,
  `CREATE INDEX IF NOT EXISTS idx_proxy_usage_channel ON proxy_usage_logs(channel_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_proxy_usage_provider ON proxy_usage_logs(provider_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category)`,
  `CREATE INDEX IF NOT EXISTS idx_http_tools_category ON http_tools(category)`,
  `CREATE INDEX IF NOT EXISTS idx_skill_categories_category ON skill_categories(category)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_root ON sessions(root_session_id)`
];

export const POSTGRES_ALTERS = [
  `ALTER TABLE agents ADD COLUMN category TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE agents ADD COLUMN fallback_models TEXT`,
  `ALTER TABLE agents ADD COLUMN fallback_cooldown_seconds INTEGER DEFAULT 900`,
  `ALTER TABLE http_tools ADD COLUMN category TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS skill_categories (skill_name TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text))`,
  `ALTER TABLE sessions ADD COLUMN root_session_id TEXT`,
  `ALTER TABLE sessions ADD COLUMN source_session_id TEXT`,
  `ALTER TABLE messages ADD COLUMN model_trace TEXT`,
  `ALTER TABLE providers ADD COLUMN capabilities TEXT`,
  `CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text))`,
  `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL, created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), UNIQUE (organization_id, slug))`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, avatar_url TEXT, last_login_at TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text))`,
  `CREATE TABLE IF NOT EXISTS memberships (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, workspace_id TEXT, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), UNIQUE (organization_id, workspace_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS identity_providers (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, type TEXT NOT NULL, provider TEXT NOT NULL, name TEXT NOT NULL, issuer_url TEXT, client_id TEXT, client_secret_ref TEXT, sso_url TEXT, certificate TEXT, claim_mapping TEXT, group_mapping TEXT, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text))`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, workspace_id TEXT, actor_user_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, metadata TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text))`,
  `ALTER TABLE providers ADD COLUMN workspace_id TEXT`,
  `ALTER TABLE agents ADD COLUMN workspace_id TEXT`,
  `ALTER TABLE sessions ADD COLUMN workspace_id TEXT`,
  `ALTER TABLE usage_logs ADD COLUMN workspace_id TEXT`,
  `ALTER TABLE http_tools ADD COLUMN workspace_id TEXT`,
  `ALTER TABLE knowledge_bases ADD COLUMN workspace_id TEXT`,
  `ALTER TABLE provider_channels ADD COLUMN workspace_id TEXT`,
  `ALTER TABLE proxy_usage_logs ADD COLUMN workspace_id TEXT`,
  `CREATE TABLE IF NOT EXISTS workspace_skill_categories (workspace_id TEXT NOT NULL, skill_name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), PRIMARY KEY (workspace_id, skill_name))`,
  `CREATE TABLE IF NOT EXISTS user_passwords (user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text))`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text), last_seen_at TEXT DEFAULT (CURRENT_TIMESTAMP::text))`
];
