import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  argumentValue,
  loadEnvironmentFile
} from "./lib/runtime-config.js";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for PostgreSQL backup.`);
  return value;
}

function commandOutput(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

function dumpFromContainer(containerId: string, user: string, database: string, target: string) {
  return new Promise<void>((resolve, reject) => {
    const partialTarget = `${target}.partial`;
    const output = fs.createWriteStream(partialTarget, { flags: "wx" });
    const child = spawn("docker", [
      "exec",
      "-i",
      containerId,
      "pg_dump",
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--username",
      user,
      "--dbname",
      database
    ], { cwd: process.cwd(), windowsHide: true });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.pipe(output);
    child.on("error", reject);
    child.on("exit", (code) => {
      output.end(() => {
        if (code === 0) {
          fs.renameSync(partialTarget, target);
          resolve();
        } else {
          fs.rmSync(partialTarget, { force: true });
          reject(new Error(`pg_dump failed with exit code ${code}: ${stderr.trim()}`));
        }
      });
    });
  });
}

function verifyArchive(containerId: string, archivePath: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", containerId, "pg_restore", "--list"], {
      cwd: process.cwd(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    fs.createReadStream(archivePath).pipe(child.stdin);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`pg_restore archive verification failed with exit code ${code}: ${stderr.trim()}`));
        return;
      }
      const entries = stdout.split(/\r?\n/).filter((line) => /^\d+;/.test(line.trim())).length;
      if (entries === 0) {
        reject(new Error("PostgreSQL backup archive contains no restorable entries."));
        return;
      }
      resolve(entries);
    });
  });
}

function sha256(filePath: string) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function main() {
  const envFile = argumentValue("env-file") || process.env.DB_BACKUP_ENV_FILE || ".env.production";
  const loadedEnvironmentFile = loadEnvironmentFile(envFile);
  const composeFile = path.resolve(
    process.cwd(),
    argumentValue("compose-file") || process.env.DB_BACKUP_COMPOSE_FILE || "docker-compose.prod.yml"
  );
  if (!fs.existsSync(composeFile)) throw new Error(`Compose file not found: ${composeFile}`);

  const user = requiredEnvironment("POSTGRES_USER");
  const database = requiredEnvironment("POSTGRES_DB");
  const outputDir = path.resolve(
    process.cwd(),
    argumentValue("output-dir") || process.env.DB_BACKUP_OUTPUT_DIR || "outputs/db-backups"
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const containerId = await commandOutput("docker", [
    "compose",
    "--env-file",
    loadedEnvironmentFile as string,
    "-f",
    composeFile,
    "ps",
    "-q",
    "postgres"
  ]);
  if (!containerId) throw new Error("PostgreSQL Compose container is not running.");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `xjd-finance-${database}-${timestamp}.dump`;
  const archivePath = path.join(outputDir, baseName);
  await dumpFromContainer(containerId, user, database, archivePath);

  const entries = await verifyArchive(containerId, archivePath);
  const stat = fs.statSync(archivePath);
  const checksum = sha256(archivePath);
  fs.writeFileSync(`${archivePath}.sha256`, `${checksum}  ${baseName}\n`, "utf8");
  fs.writeFileSync(`${archivePath}.json`, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    database,
    archive: baseName,
    bytes: stat.size,
    sha256: checksum,
    restoreListEntries: entries,
    composeFile: path.basename(composeFile)
  }, null, 2)}\n`, "utf8");

  console.log("PostgreSQL backup completed and archive structure verified.");
  console.log(`Archive: ${archivePath}`);
  console.log(`Size: ${stat.size} bytes`);
  console.log(`Restore-list entries: ${entries}`);
  console.log(`SHA-256: ${checksum}`);
  console.log("No database restore or mutation was performed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
