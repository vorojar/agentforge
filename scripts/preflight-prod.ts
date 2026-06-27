import { config as loadEnv } from "dotenv";
import { runProductionPreflight } from "../packages/server/src/preflight.js";

loadEnv({ quiet: true });

const report = runProductionPreflight();
for (const check of report.checks) {
  const mark = check.status === "pass" ? "OK" : check.status.toUpperCase();
  console.log(`[${mark}] ${check.id}: ${check.message}`);
  if (check.remediation) console.log(`  -> ${check.remediation}`);
}

if (!report.ok) {
  console.error("Production preflight failed.");
  process.exit(1);
}

console.log("Production preflight passed.");
