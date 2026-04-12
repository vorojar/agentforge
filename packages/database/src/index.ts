import type { DatabaseAdapter } from "@agentforge/types";
import { SQLiteAdapter } from "./sqlite.js";

export { SQLiteAdapter } from "./sqlite.js";
export { MySQLAdapter } from "./mysql.js";
export type { MySQLConfig } from "./mysql.js";
export { SQLITE_MIGRATIONS, SQLITE_INDEXES, SQLITE_INCREMENTAL_MIGRATIONS } from "./migrations.js";
export { MYSQL_MIGRATIONS, MYSQL_INDEXES } from "./migrations.js";

export async function createDatabase(dbPath: string): Promise<DatabaseAdapter> {
  const adapter = new SQLiteAdapter(dbPath);
  await adapter.initialize();
  return adapter;
}
