import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { argumentValue, loadEnvironmentFile } from "./lib/runtime-config.js";
import { createMigrationManifest, prismaForUrl, writeManifest } from "./lib/migration-manifest.js";

function checksum(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeIdentity(url: string) {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`;
}

function pgArgs(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const tlsEnvironment: NodeJS.ProcessEnv = {};
  const sslMode = parsed.searchParams.get("sslmode");
  const sslRootCert = parsed.searchParams.get("sslrootcert");
  const sslCert = parsed.searchParams.get("sslcert");
  const sslKey = parsed.searchParams.get("sslkey");
  if (sslMode) tlsEnvironment.PGSSLMODE = sslMode;
  if (sslRootCert) tlsEnvironment.PGSSLROOTCERT = sslRootCert;
  if (sslCert) tlsEnvironment.PGSSLCERT = sslCert;
  if (sslKey) tlsEnvironment.PGSSLKEY = sslKey;
  return {
    env: {
      ...process.env,
      ...tlsEnvironment,
      PGPASSWORD: decodeURIComponent(parsed.password)
    },
    args: ["--host", parsed.hostname, "--port", parsed.port || "5432", "--username", decodeURIComponent(parsed.username), "--dbname", parsed.pathname.replace(/^\//, "")]
  };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, logFile?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { env, windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; if (logFile) fs.appendFileSync(logFile, chunk); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (logFile) fs.appendFileSync(logFile, chunk); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed with exit code ${code}: ${stderr.slice(-1000)}`)));
  });
}

async function main() {
  loadEnvironmentFile(argumentValue("env-file"));
  const archive = path.resolve(process.cwd(), argumentValue("file") || "");
  const targetUrl = argumentValue("target-url") || process.env.TARGET_DATABASE_URL;
  const sourceUrl = argumentValue("source-url") || process.env.SOURCE_DATABASE_URL;
  if (!fs.existsSync(archive) || !archive.endsWith(".dump")) throw new Error("A valid --file=<backup.dump> is required.");
  if (!targetUrl) throw new Error("--target-url or TARGET_DATABASE_URL is required.");
  const targetName = new URL(targetUrl).pathname.replace(/^\//, "");
  if (!/_(test|staging|restore)(?:$|_)/i.test(targetName)) throw new Error("BLOCKED: restore target database name must contain _test, _staging, or _restore.");
  if (sourceUrl && safeIdentity(sourceUrl) === safeIdentity(targetUrl)) throw new Error("BLOCKED: restore target equals source database.");
  const expectedFile = `${archive}.sha256`;
  if (!fs.existsSync(expectedFile)) throw new Error("Missing .sha256 sidecar; restore refused.");
  const expected = fs.readFileSync(expectedFile, "utf8").trim().split(/\s+/)[0];
  const actual = checksum(archive);
  if (actual !== expected) throw new Error("SHA-256 mismatch; restore refused.");
  await run("pg_restore", ["--list", archive], process.env);
  const prisma = prismaForUrl(targetUrl);
  try {
    const existing = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='public'`;
    if (Number(existing[0]?.count || 0) > 0) throw new Error("BLOCKED: target test database is not empty. Create a new isolated restore database.");
  } finally { await prisma.$disconnect(); }
  const outputDir = path.resolve(process.cwd(), argumentValue("output-dir") || "outputs/restore-logs");
  fs.mkdirSync(outputDir, { recursive: true });
  const logFile = path.join(outputDir, `restore-${targetName}-${Date.now()}.log`);
  const connection = pgArgs(targetUrl);
  await run("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", ...connection.args, archive], connection.env, logFile);
  const manifest = await createMigrationManifest(targetUrl);
  const manifestPath = writeManifest(manifest, path.join(outputDir, `manifest-${targetName}-${Date.now()}.json`));
  console.log(`Restore completed only into isolated database ${targetName}.`);
  console.log(`Restore log: ${logFile}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log("Run pnpm verify:production-readonly with TARGET_DATABASE_URL to finish acceptance checks.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
