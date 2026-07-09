import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = path.resolve(projectRoot, process.env.SQLITE_DB_PATH || "prisma/dev.db");
const outputDir = path.resolve(projectRoot, process.env.DB_BACKUP_OUTPUT_DIR || "outputs/db-backups");

async function copyIfExists(source: string, target: string) {
  if (!fs.existsSync(source)) return false;
  await fs.promises.copyFile(source, target);
  return true;
}

async function main() {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`SQLite database not found: ${databasePath}`);
  }

  await fs.promises.mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${timestamp}-dev.db`;
  const target = path.join(outputDir, baseName);

  await fs.promises.copyFile(databasePath, target);
  const copiedSidecars = [];
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const source = `${databasePath}${suffix}`;
    const sidecarTarget = `${target}${suffix}`;
    if (await copyIfExists(source, sidecarTarget)) copiedSidecars.push(sidecarTarget);
  }

  const stat = await fs.promises.stat(target);
  console.log("SQLite database backup exported.");
  console.log(`Source: ${databasePath}`);
  console.log(`File: ${target}`);
  console.log(`Size: ${stat.size} bytes`);
  if (copiedSidecars.length) {
    console.log(`Sidecar files: ${copiedSidecars.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
