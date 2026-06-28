import type { DatabaseAdapter } from "@agentforge/types";
import { PostgresAdapter, type PostgresConfig } from "./postgres.js";

export { PostgresAdapter } from "./postgres.js";
export type { PostgresConfig } from "./postgres.js";
export { POSTGRES_MIGRATIONS, POSTGRES_INDEXES, POSTGRES_ALTERS } from "./migrations.js";

export type DatabaseConfig = { type: "postgres" } & PostgresConfig;

export interface InitializableDatabaseAdapter extends DatabaseAdapter {
  initialize(): Promise<void>;
}

export function createDatabaseAdapter(config: string | DatabaseConfig): InitializableDatabaseAdapter {
  if (typeof config === "string") {
    throw new Error("PostgreSQL configuration is required.");
  }
  return new PostgresAdapter(config);
}

export async function createDatabase(config: string | DatabaseConfig): Promise<DatabaseAdapter> {
  const adapter = createDatabaseAdapter(config);
  await adapter.initialize();
  return adapter;
}
