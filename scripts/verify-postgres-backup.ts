import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  argumentValue,
  loadEnvironmentFile
} from "./lib/runtime-config.js";

function latestArchive(directory: string) {
  if (!fs.existsSync(directory)) return null;
  const rows = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".dump"))
    .map((name) => ({ name, modifiedAt: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  return rows[0] ? path.join(directory, rows[0].name) : null;
}

function sha256(filePath: string) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
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
    child.on("exit", (code) => code === 0
      ? resolve(stdout.trim())
      : reject(new Error(`${command} exited with ${code}: ${stderr.trim() || stdout.trim()}`)));
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
      if (code !== 0) return reject(new Error(`pg_restore verification failed: ${stderr.trim()}`));
      const entries = stdout.split(/\r?\n/).filter((line) => /^\d+;/.test(line.trim())).length;
      if (entries === 0) return reject(new Error("Backup archive contains no restorable entries."));
      resolve(entries);
    });
  });
}

async function main() {
  const envFile = argumentValue("env-file") || process.env.DB_BACKUP_ENV_FILE || ".env.production";
  const loadedEnvironmentFile = loadEnvironmentFile(envFile) as string;
  const composeFile = path.resolve(
    process.cwd(),
    argumentValue("compose-file") || process.env.DB_BACKUP_COMPOSE_FILE || "docker-compose.prod.yml"
  );
  const outputDir = path.resolve(
    process.cwd(),
    argumentValue("output-dir") || process.env.DB_BACKUP_OUTPUT_DIR || "outputs/db-backups"
  );
  const requestedFile = argumentValue("file");
  const archivePath = requestedFile ? path.resolve(process.cwd(), requestedFile) : latestArchive(outputDir);
  if (!archivePath || !fs.existsSync(archivePath)) throw new Error("No PostgreSQL .dump backup was found to verify.");

  const containerId = await commandOutput("docker", [
    "compose",
    "--env-file",
    loadedEnvironmentFile,
    "-f",
    composeFile,
    "ps",
    "-q",
    "postgres"
  ]);
  if (!containerId) throw new Error("PostgreSQL Compose container is not running.");

  const checksum = sha256(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  if (fs.existsSync(checksumPath)) {
    const expected = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
    if (checksum !== expected) throw new Error("SHA-256 mismatch: the backup file has changed or is corrupted.");
  }

  const entries = await verifyArchive(containerId, archivePath);
  console.log("PostgreSQL backup verification passed.");
  console.log(`Archive: ${archivePath}`);
  console.log(`Size: ${fs.statSync(archivePath).size} bytes`);
  console.log(`Restore-list entries: ${entries}`);
  console.log(`SHA-256: ${checksum}`);
  console.log("Verification was read-only; no database restore was performed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
