import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const baselineMigration = "20260720000100_baseline";
const isWindows = process.platform === "win32";

function runPnpm(args: string[]) {
  const result = isWindows
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", ["pnpm", ...args].join(" ")], {
        stdio: "inherit",
        env: process.env
      })
    : spawnSync("pnpm", args, { stdio: "inherit", env: process.env });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Schema deployment command failed: pnpm ${args.join(" ")}`);
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
    console.log("Existing finance database detected. Synchronizing once and recording the migration baseline.");
    runPnpm(["exec", "prisma", "db", "push", "--skip-generate", "--accept-data-loss"]);
    runPnpm(["exec", "prisma", "migrate", "resolve", "--applied", baselineMigration]);
    return;
  }

  console.log(hasMigrationHistory ? "Applying pending Prisma migrations." : "Initializing a new database from Prisma migrations.");
  runPnpm(["exec", "prisma", "migrate", "deploy"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
