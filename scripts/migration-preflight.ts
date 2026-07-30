import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { argumentValue, loadEnvironmentFile } from "./lib/runtime-config.js";
import { prismaForUrl, prismaSchemaSha256 } from "./lib/migration-manifest.js";

type DbInfo = {
  identity: string;
  majorVersion: number;
  sizeBytes: string;
  encoding: string;
  timezone: string;
  collation: string;
  tables: string[];
  migrations: Array<{ name: string; finished: boolean; rolledBack: boolean }>;
  extensions: string[];
};

function safeIdentity(databaseUrl: string) {
  const value = new URL(databaseUrl);
  return `${value.hostname}:${value.port || "5432"}/${value.pathname.replace(/^\//, "")}`;
}

async function inspect(databaseUrl: string): Promise<DbInfo> {
  const prisma = prismaForUrl(databaseUrl);
  try {
    await prisma.$queryRaw`SELECT 1`;
    const meta = (await prisma.$queryRaw<Array<{ version_num: string; size: bigint; encoding: string; timezone: string; collation: string }>>`
      SELECT current_setting('server_version_num') AS version_num,
             pg_database_size(current_database()) AS size,
             pg_encoding_to_char(encoding) AS encoding,
             current_setting('TimeZone') AS timezone,
             datcollate AS collation
      FROM pg_database WHERE datname=current_database()
    `)[0];
    const tables = (await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name
    `).map((row) => row.name);
    const migrations = tables.includes("_prisma_migrations")
      ? await prisma.$queryRaw<Array<{ name: string; finished: boolean; rolledBack: boolean }>>`
          SELECT migration_name AS name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack"
          FROM "_prisma_migrations" ORDER BY started_at
        `
      : [];
    const extensions = (await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT extname AS name FROM pg_extension ORDER BY extname
    `).map((row) => row.name);
    return {
      identity: safeIdentity(databaseUrl),
      majorVersion: Math.floor(Number(meta?.version_num || 0) / 10000),
      sizeBytes: String(meta?.size ?? 0),
      encoding: meta?.encoding || "unknown",
      timezone: meta?.timezone || "unknown",
      collation: meta?.collation || "unknown",
      tables,
      migrations,
      extensions
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  loadEnvironmentFile(argumentValue("env-file"));
  const sourceUrl = argumentValue("source-url") || process.env.SOURCE_DATABASE_URL;
  const targetUrl = argumentValue("target-url") || process.env.TARGET_DATABASE_URL;
  const phase = argumentValue("phase") || "rehearsal";
  if (!new Set(["rehearsal", "cutover"]).has(phase)) throw new Error("--phase must be rehearsal or cutover.");
  if (!sourceUrl || !targetUrl) throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL (or matching arguments) are required.");
  if (safeIdentity(sourceUrl) === safeIdentity(targetUrl)) throw new Error("BLOCKED: source and target point to the same database identity.");
  const [source, target] = await Promise.all([inspect(sourceUrl), inspect(targetUrl)]);
  const requiredTables = ["FinanceOrder", "RawLedgerLine", "FinanceChargeLine", "ImportBatch", "ConfirmationDocument", "ActionLog", "MonthClose"];
  const missingSource = requiredTables.filter((table) => !source.tables.includes(table));
  const failedSourceMigrations = source.migrations.filter((migration) => !migration.finished || migration.rolledBack);
  const targetPath = process.env.POSTGRES_DATA_DIR;
  const targetStats = targetPath && fs.existsSync(targetPath) ? fs.statfsSync(targetPath) : null;
  const freeBytes = targetStats ? targetStats.bavail * targetStats.bsize : null;
  const targetUnexpectedTables = target.tables.filter((table) => table !== "_prisma_migrations");
  const requiredExtensions = source.extensions.filter((extension) => extension !== "plpgsql");
  const missingTargetExtensions = requiredExtensions.filter((extension) => !target.extensions.includes(extension));
  const diskCapacity = freeBytes === null
    ? "manual_check_required"
    : freeBytes > Number(source.sizeBytes) * 2
      ? "pass"
      : "blocked";
  const maintenanceModeEnabled = process.env.MAINTENANCE_MODE === "true";
  const postgresMajorCompatible = target.majorVersion >= source.majorVersion;
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const result = {
    checkedAt: new Date().toISOString(),
    readOnly: true,
    phase,
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",
    gitSha,
    prismaSchemaSha256: prismaSchemaSha256(),
    source,
    target,
    targetDiskFreeBytes: freeBytes === null ? "not_checked_remote_or_path_missing" : String(freeBytes),
    checks: {
      distinctDatabases: true,
      sourceBusinessTablesComplete: missingSource.length === 0,
      sourceMigrationsHealthy: failedSourceMigrations.length === 0,
      postgresMajorCompatible,
      databaseEncodingCompatible: source.encoding === target.encoding && source.encoding.toUpperCase() === "UTF8",
      requiredExtensionsAvailable: missingTargetExtensions.length === 0,
      targetReadyForRestore: targetUnexpectedTables.length === 0,
      targetDiskCapacity: diskCapacity,
      maintenanceModeEnabled: phase === "rehearsal" ? "not_required" : maintenanceModeEnabled
    },
    missingSourceTables: missingSource,
    failedSourceMigrations,
    targetUnexpectedTables,
    missingTargetExtensions,
    warnings: [
      source.timezone !== target.timezone ? `database timezone differs: source=${source.timezone}, target=${target.timezone}` : null,
      source.collation !== target.collation ? `database collation differs: source=${source.collation}, target=${target.collation}` : null,
      phase === "rehearsal" && diskCapacity !== "pass" ? `target disk capacity requires cutover-host verification: ${diskCapacity}` : null,
      phase === "rehearsal" && !maintenanceModeEnabled ? "maintenance mode is intentionally not required for a read-only rehearsal" : null
    ].filter((value): value is string => Boolean(value))
  };

  const blockingReasons = [
    !result.checks.sourceBusinessTablesComplete ? `source is missing required tables: ${missingSource.join(", ")}` : null,
    !result.checks.sourceMigrationsHealthy ? "source contains unfinished or rolled-back Prisma migrations" : null,
    !result.checks.postgresMajorCompatible ? `target PostgreSQL major version is older than source: source=${source.majorVersion}, target=${target.majorVersion}` : null,
    !result.checks.databaseEncodingCompatible ? `database encoding mismatch or non-UTF8 encoding: source=${source.encoding}, target=${target.encoding}` : null,
    !result.checks.requiredExtensionsAvailable ? `target is missing source extensions: ${missingTargetExtensions.join(", ")}` : null,
    !result.checks.targetReadyForRestore ? `restore target is not empty: ${targetUnexpectedTables.join(", ")}` : null,
    phase === "cutover" && result.checks.targetDiskCapacity !== "pass" ? `target disk capacity check did not pass: ${result.checks.targetDiskCapacity}` : null,
    phase === "cutover" && !maintenanceModeEnabled ? "maintenance mode is not enabled" : null
  ].filter((value): value is string => Boolean(value));

  Object.assign(result, { blockingReasons });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  console.log(serialized.trimEnd());
  const output = argumentValue("output");
  if (output) {
    const absolute = path.resolve(process.cwd(), output);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, serialized, { encoding: "utf8", mode: 0o600 });
    console.error(`Preflight report: ${absolute}`);
  }
  if (blockingReasons.length > 0) process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
