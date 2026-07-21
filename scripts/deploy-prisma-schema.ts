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

async function main() {
  const prisma = new PrismaClient();
  let hasApplicationTables = false;
  let hasMigrationHistory = false;

  try {
    hasApplicationTables = await tableExists(prisma, "AppUser");
    hasMigrationHistory = await tableExists(prisma, "_prisma_migrations");
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
