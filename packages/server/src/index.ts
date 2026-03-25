import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve project root from this file's location (works for both src/ and dist/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");
process.chdir(projectRoot);
loadEnv();

import { loadConfig } from "./config.js";
import { bootstrap } from "./bootstrap.js";
import { createApp } from "./app.js";

const config = loadConfig();
const ctx = bootstrap(config);
const app = createApp(ctx);

app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`AgentForge server running at ${address}`);
});
