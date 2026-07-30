import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const baselineMigration = "20260720000100_baseline";
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

function runPrisma(args: string[]) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: "inherit",
    env: process.env
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Schema deployment command failed: prisma ${args.join(" ")}`);
  }
}

async function tableExists(prisma: PrismaClient, tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS present
  `;
  return Boolean(rows[0]?.present);
}

type BaselineShape = {
  tables: Map<string, Set<string>>;
  indexes: Set<string>;
  constraints: Set<string>;
};

function readBaselineShape(): BaselineShape {
  const migrationPath = path.resolve(process.cwd(), "prisma", "migrations", baselineMigration, "migration.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const tables = new Map<string, Set<string>>();
  for (const match of sql.matchAll(/CREATE TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/g)) {
    const columns = new Set<string>();
    for (const columnMatch of match[2].matchAll(/^\s+"([^"]+)"\s+/gm)) columns.add(columnMatch[1]);
    tables.set(match[1], columns);
  }
  return {
    tables,
    indexes: new Set([...sql.matchAll(/CREATE(?: UNIQUE)? INDEX\s+"([^"]+)"/g)].map((match) => match[1])),
    constraints: new Set([...sql.matchAll(/CONSTRAINT\s+"([^"]+)"/g)].map((match) => match[1]))
  };
}

async function validateExistingBaseline(prisma: PrismaClient) {
  const expected = readBaselineShape();
  const actualColumns = await prisma.$queryRaw<Array<{ tableName: string; columnName: string }>>`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const actualIndexes = new Set((await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'
  `).map((row) => row.name));
  const actualConstraints = new Set((await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT conname AS name
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
  `).map((row) => row.name));
  const actualTables = new Map<string, Set<string>>();
  for (const row of actualColumns) {
    const columns = actualTables.get(row.tableName) ?? new Set<string>();
    columns.add(row.columnName);
    actualTables.set(row.tableName, columns);
  }

  const missing: string[] = [];
  for (const [table, columns] of expected.tables) {
    const actual = actualTables.get(table);
    if (!actual) {
      missing.push(`table:${table}`);
      continue;
    }
    for (const column of columns) if (!actual.has(column)) missing.push(`column:${table}.${column}`);
  }
  for (const index of expected.indexes) if (!actualIndexes.has(index)) missing.push(`index:${index}`);
  for (const constraint of expected.constraints) if (!actualConstraints.has(constraint)) missing.push(`constraint:${constraint}`);

  if (missing.length > 0) {
    throw new Error(`BLOCKED: existing database does not match the audited baseline (${missing.slice(0, 20).join(", ")}${missing.length > 20 ? `, +${missing.length - 20} more` : ""}).`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  let hasApplicationTables = false;
  let hasMigrationHistory = false;

  try {
    hasApplicationTables = await tableExists(prisma, "AppUser");
    hasMigrationHistory = await tableExists(prisma, "_prisma_migrations");
    if (hasApplicationTables && !hasMigrationHistory) await validateExistingBaseline(prisma);
  } finally {
    await prisma.$disconnect();
  }

  if (hasApplicationTables && !hasMigrationHistory) {
    console.log("Existing finance database detected. Recording the existing baseline before applying additive migrations.");
    runPrisma(["migrate", "resolve", "--applied", baselineMigration]);
  } else {
    console.log(hasMigrationHistory ? "Applying pending Prisma migrations." : "Initializing a new database from Prisma migrations.");
  }

  runPrisma(["migrate", "deploy"]);
  runPrisma([
    "db",
    "execute",
    "--file",
    "prisma/import-archive-schema.sql",
    "--schema",
    "prisma/schema.prisma"
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
