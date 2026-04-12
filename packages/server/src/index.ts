/**
 * 服务器入口
 * 功能：启动 AgentForge 服务器
 * 创建时间：2026-03-31
 * 负责人：王觉贤
 */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");
process.chdir(projectRoot);
loadEnv();

import { loadConfig } from "./config.js";
import { bootstrap } from "./bootstrap.js";
import { createApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const ctx = await bootstrap(config);
  const app = createApp(ctx);

  app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`AgentForge server running at ${address}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
