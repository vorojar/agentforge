import type { DatabaseAdapter } from "@agentforge/types";
import { SQLiteAdapter } from "./sqlite.js";
import { MySQLAdapter, type MySQLConfig } from "./mysql.js";

export { SQLiteAdapter } from "./sqlite.js";
export { MySQLAdapter } from "./mysql.js";
export type { MySQLConfig } from "./mysql.js";
export { SQLITE_MIGRATIONS, SQLITE_INDEXES, SQLITE_INCREMENTAL_MIGRATIONS } from "./migrations.js";
export { MYSQL_MIGRATIONS, MYSQL_INDEXES, MYSQL_ALTERS } from "./migrations.js";

export type DatabaseConfig =
  | { type: "sqlite"; path: string }
  | ({ type: "mysql" } & MySQLConfig);

export interface InitializableDatabaseAdapter extends DatabaseAdapter {
  initialize(): Promise<void>;
}

export function createDatabaseAdapter(config: string | DatabaseConfig): InitializableDatabaseAdapter {
  if (typeof config === "string") return new SQLiteAdapter(config);
  if (config.type === "sqlite") return new SQLiteAdapter(config.path);
  return new MySQLAdapter(config);
}

export async function createDatabase(config: string | DatabaseConfig): Promise<DatabaseAdapter> {
  const adapter = createDatabaseAdapter(config);
  await adapter.initialize();
  return adapter;
}
