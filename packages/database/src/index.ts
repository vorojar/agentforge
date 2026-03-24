import type { DatabaseAdapter } from "@agentforge/types";
import { SQLiteAdapter } from "./sqlite.js";

export { SQLiteAdapter } from "./sqlite.js";
export { MIGRATIONS } from "./migrations.js";

export function createDatabase(type: string, url: string): DatabaseAdapter {
  switch (type) {
    case "sqlite":
      return new SQLiteAdapter(url);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}
