import { readFileSync } from "node:fs";

interface Check {
  id: string;
  ok: boolean;
  message: string;
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

const checks: Check[] = [
  scriptCheck("demo:reset"),
  scriptCheck("demo:seed"),
  scriptCheck("demo:status"),
  scriptCheck("preflight:prod"),
  scriptCheck("verify:postgres"),
  fileContains("docs/COMMERCIAL_READINESS.md", ["Acceptance Matrix", "Demo Environment Standard", "Release Version Standard"]),
  fileContains("docs/CUSTOMER_DELIVERY.md", ["Required Customer Inputs", "Production Preflight", "Go-Live Smoke", "Rollback Evidence"]),
  fileContains("docs/PRICING.md", ["Recommended Packaging", "Pricing Units", "Buyer Narrative", "Quote Readiness Gate"]),
  fileContains("docs/RELEASE_CHECKLIST.md", ["pnpm demo:reset", "COMMERCIAL_READINESS.md", "CUSTOMER_DELIVERY.md", "PRICING.md"]),
  fileContains("README.md", ["docs/COMMERCIAL_READINESS.md", "docs/CUSTOMER_DELIVERY.md", "docs/PRICING.md", "pnpm demo:seed"]),
  fileContains("docs/MAINTENANCE.md", ["Commercial Readiness Checklist", "pnpm demo:reset", "docs/PRICING.md"]),
  fileContains("task.md", ["Commercial Delivery Target", "Demo environment can be reset", "customer IT/executive review"]),
];

for (const check of checks) {
  console.log(`[${check.ok ? "OK" : "FAIL"}] ${check.id}: ${check.message}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  process.exitCode = 1;
}

function scriptCheck(name: string): Check {
  return {
    id: `script:${name}`,
    ok: Boolean(packageJson.scripts?.[name]),
    message: packageJson.scripts?.[name] ? `package script is defined as "${packageJson.scripts[name]}"` : "package script is missing",
  };
}

function fileContains(path: string, needles: string[]): Check {
  let content = "";
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return { id: `file:${path}`, ok: false, message: "file is missing" };
  }

  const missing = needles.filter((needle) => !content.includes(needle));
  return {
    id: `file:${path}`,
    ok: missing.length === 0,
    message: missing.length === 0 ? "required commercial readiness terms are present" : `missing: ${missing.join(", ")}`,
  };
}
