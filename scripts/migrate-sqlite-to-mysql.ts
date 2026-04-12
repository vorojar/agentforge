/**
 * SQLite → MySQL 数据迁移脚本
 * 功能：将现有 SQLite 数据库的数据迁移到 MySQL
 * 使用方法：npx tsx scripts/migrate-sqlite-to-mysql.ts [sqlite_path]
 * 依赖：sql.js（纯 JS/WASM 实现，无需编译原生模块）
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 * 最后更新时间：2026-04-01
 */

import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import mysql from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MYSQL_MIGRATIONS, MYSQL_INDEXES } from "../packages/database/src/migrations";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const SQLITE_PATH = process.argv[2] || "./data/agentforge.db";

interface MigrationStats {
  table: string;
  count: number;
}

function queryAll(db: SqlJsDatabase, sql: string, params?: unknown[]): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const results: Record<string, unknown>[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return results;
}

function queryOne(db: SqlJsDatabase, sql: string, params?: unknown[]): Record<string, unknown> | undefined {
  const rows = queryAll(db, sql, params);
  return rows[0];
}

async function main() {
  console.log("=== AgentForge: SQLite → MySQL 数据迁移 ===\n");

  // 1. 用 sql.js 打开 SQLite
  console.log(`[1/5] 打开 SQLite 数据库: ${SQLITE_PATH}`);
  const SQL = await initSqlJs();
  const fileBuffer = readFileSync(resolve(SQLITE_PATH));
  const sqlite = new SQL.Database(fileBuffer);

  // 2. 连接 MySQL
  const mysqlConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "agentforge",
    multipleStatements: true,
  };
  console.log(`[2/5] 连接 MySQL: ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
  const pool = await mysql.createPool(mysqlConfig);

  // 3. 创建表结构
  console.log("[3/5] 创建 MySQL 表结构...");
  const statements = MYSQL_MIGRATIONS.split(";").map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    await pool.execute(stmt);
  }
  for (const idx of MYSQL_INDEXES) {
    try { await pool.execute(idx); } catch { /* index may already exist */ }
  }
  console.log("  表结构创建完成");

  // 4. 迁移数据
  console.log("[4/5] 开始迁移数据...\n");
  const stats: MigrationStats[] = [];

  await migrateTable(sqlite, pool, "providers", stats);
  await migrateTable(sqlite, pool, "agents", stats);
  await migrateTable(sqlite, pool, "api_keys", stats);
  await migrateTable(sqlite, pool, "sessions", stats);
  await migrateTable(sqlite, pool, "messages", stats);
  await migrateTable(sqlite, pool, "usage_logs", stats);
  await migrateTable(sqlite, pool, "http_tools", stats);

  await migrateKnowledgeData(sqlite, pool, stats);

  // 5. 统计
  console.log("\n[5/5] 迁移完成！统计：\n");
  for (const s of stats) {
    console.log(`  ${s.table}: ${s.count} 条`);
  }

  sqlite.close();
  await pool.end();
  console.log("\n数据库连接已关闭。迁移成功！");
}

async function migrateTable(
  sqlite: SqlJsDatabase,
  pool: mysql.Pool,
  table: string,
  stats: MigrationStats[]
) {
  const rows = queryAll(sqlite, `SELECT * FROM ${table}`);
  if (rows.length === 0) {
    console.log(`  ${table}: 0 条 (跳过)`);
    stats.push({ table, count: 0 });
    return;
  }

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

  let count = 0;
  for (const row of rows) {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return null;
      if (typeof val === "boolean") return val ? 1 : 0;
      if (val instanceof Uint8Array) return Buffer.from(val);
      return val;
    });
    try {
      await pool.execute(sql, values);
      count++;
    } catch (err) {
      console.error(`  警告: ${table} 插入失败:`, (err as Error).message);
    }
  }

  console.log(`  ${table}: ${count}/${rows.length} 条`);
  stats.push({ table, count });
}

async function migrateKnowledgeData(
  sqlite: SqlJsDatabase,
  pool: mysql.Pool,
  stats: MigrationStats[]
) {
  const tableInfo = queryOne(sqlite,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_sources'"
  );

  if (!tableInfo) {
    console.log("  knowledge_sources: 不存在 (跳过)");
    console.log("  knowledge_chunks: 不存在 (跳过)");
    return;
  }

  const oldSources = queryAll(sqlite, "SELECT * FROM knowledge_sources");
  if (oldSources.length === 0) {
    console.log("  knowledge_sources: 0 条 (跳过)");
    console.log("  knowledge_chunks: 0 条 (跳过)");
    stats.push({ table: "knowledge_sources", count: 0 });
    stats.push({ table: "knowledge_chunks", count: 0 });
    return;
  }

  const agentIds = [...new Set(oldSources.map(s => s.agent_id as string))];
  const agentKbMap = new Map<string, string>();

  for (const agentId of agentIds) {
    const agent = queryOne(sqlite, "SELECT name FROM agents WHERE id = ?", [agentId]);
    const kbName = agent ? `${agent.name} - 默认知识库` : `知识库 (Agent: ${(agentId ?? "").slice(0, 8)})`;
    const kbId = uuidv4();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    await pool.execute(
      "INSERT INTO knowledge_bases (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [kbId, kbName, "从旧版迁移的知识库", now, now]
    );

    await pool.execute(
      "INSERT INTO agent_knowledge (agent_id, kb_id) VALUES (?, ?)",
      [agentId, kbId]
    );

    agentKbMap.set(agentId, kbId);
  }
  console.log(`  knowledge_bases: 创建了 ${agentKbMap.size} 个知识库`);
  stats.push({ table: "knowledge_bases", count: agentKbMap.size });

  let sourceCount = 0;
  for (const src of oldSources) {
    const kbId = agentKbMap.get(src.agent_id as string);
    if (!kbId) continue;
    try {
      await pool.execute(
        "INSERT INTO knowledge_sources (id, kb_id, source_name, raw_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [src.id, kbId, src.source_name, src.raw_content, src.created_at, src.updated_at ?? src.created_at]
      );
      sourceCount++;
    } catch (err) {
      console.error(`  警告: knowledge_sources 插入失败:`, (err as Error).message);
    }
  }
  console.log(`  knowledge_sources: ${sourceCount}/${oldSources.length} 条`);
  stats.push({ table: "knowledge_sources", count: sourceCount });

  const oldChunks = queryAll(sqlite, "SELECT * FROM knowledge_chunks");
  let chunkCount = 0;
  for (const chunk of oldChunks) {
    const kbId = agentKbMap.get(chunk.agent_id as string);
    if (!kbId) continue;
    try {
      const embedding = chunk.embedding instanceof Uint8Array ? Buffer.from(chunk.embedding) : (chunk.embedding ?? null);
      await pool.execute(
        "INSERT INTO knowledge_chunks (id, kb_id, source_name, chunk_index, content, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [chunk.id, kbId, chunk.source_name, chunk.chunk_index, chunk.content, embedding, chunk.created_at]
      );
      chunkCount++;
    } catch (err) {
      console.error(`  警告: knowledge_chunks 插入失败:`, (err as Error).message);
    }
  }
  console.log(`  knowledge_chunks: ${chunkCount}/${oldChunks.length} 条`);
  stats.push({ table: "knowledge_chunks", count: chunkCount });
}

main().catch(err => {
  console.error("\n迁移失败:", err);
  process.exit(1);
});
