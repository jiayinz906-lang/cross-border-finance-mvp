import assert from "node:assert/strict";
import type { MigrationManifest } from "./lib/migration-manifest.js";
import { compareMigrationManifests } from "./compare-migration-manifests.js";

function fixture(): MigrationManifest {
  return {
    formatVersion: 1,
    generatedAt: "2026-07-29T00:00:00.000Z",
    database: {
      host: "source.internal",
      port: "5432",
      name: "finance",
      schema: "public",
      version: "PostgreSQL 17",
      sizeBytes: "1024",
      encoding: "UTF8",
      timezone: "UTC",
      collation: "C.UTF-8"
    },
    gitSha: "audit-sha",
    schemaSha256: "schema-sha",
    tables: { FinanceOrder: { count: "2", minId: "1", maxId: "2" } },
    monthlyOrderCounts: { "2026-06": "2" },
    specialCounts: { actionLogs: "1" },
    financialTotals: { receivable: "100.00", payable: "80.00" },
    monthCloseStates: [{ month: "2026-06", status: "locked", lockedAt: "2026-07-01T00:00:00.000Z", unlockedAt: null }],
    migrations: [{ name: "init", checksum: "checksum", finishedAt: "2026-07-01T00:00:00.000Z", rolledBackAt: null }]
  };
}

const source = fixture();
const identical = structuredClone(source);
identical.database.host = "target.internal";

const passed = compareMigrationManifests(source, identical);
assert.equal(passed.result, "pass");
assert.equal(passed.summary.blockers, 0);

const financialMismatch = structuredClone(identical);
financialMismatch.financialTotals.receivable = "99.99";
const blockedFinancial = compareMigrationManifests(source, financialMismatch);
assert.equal(blockedFinancial.result, "blocked");
assert(blockedFinancial.findings.some((item) => item.field === "financialTotals.receivable" && item.level === "阻断"));

const rowRangeMismatch = structuredClone(identical);
rowRangeMismatch.tables.FinanceOrder.maxId = "3";
const blockedRows = compareMigrationManifests(source, rowRangeMismatch);
assert.equal(blockedRows.result, "blocked");
assert(blockedRows.findings.some((item) => item.field === "tables.FinanceOrder" && item.level === "阻断"));

const environmentWarning = structuredClone(identical);
environmentWarning.database.timezone = "Asia/Shanghai";
const warned = compareMigrationManifests(source, environmentWarning);
assert.equal(warned.result, "warning");
assert.equal(warned.summary.blockers, 0);

console.log("Migration tooling verification passed: identical, blocking mismatch, row-range mismatch and warning cases.");
