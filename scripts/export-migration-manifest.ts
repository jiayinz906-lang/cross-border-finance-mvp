import path from "node:path";
import { argumentValue, loadEnvironmentFile } from "./lib/runtime-config.js";
import { createMigrationManifest, writeManifest } from "./lib/migration-manifest.js";

async function main() {
  loadEnvironmentFile(argumentValue("env-file"));
  const databaseUrl = argumentValue("database-url") || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL or --database-url is required.");
  const output = argumentValue("output") || path.join("outputs", "migration", `manifest-${Date.now()}.json`);
  const manifest = await createMigrationManifest(databaseUrl);
  const saved = writeManifest(manifest, output);
  console.log(`Migration manifest created: ${saved}`);
  console.log(`Tables: ${Object.keys(manifest.tables).length}; orders: ${manifest.tables.FinanceOrder?.count ?? "0"}; schema: ${manifest.schemaSha256.slice(0, 12)}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
