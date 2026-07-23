import fs from "node:fs";
import { argumentValue, loadEnvironmentFile } from "./lib/runtime-config.js";

const explicitEnvironmentFile = argumentValue("env-file");

if (explicitEnvironmentFile) {
  loadEnvironmentFile(explicitEnvironmentFile);
} else if (!process.env.DATABASE_URL && fs.existsSync(".env.docker")) {
  loadEnvironmentFile(".env.docker");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the role verification workflow.");
}

const databaseUrl = new URL(process.env.DATABASE_URL);
if (databaseUrl.hostname === "postgres") {
  databaseUrl.hostname = argumentValue("postgres-host") || "127.0.0.1";
  databaseUrl.port = argumentValue("postgres-port") || process.env.POSTGRES_DEV_PORT || "54320";
  process.env.DATABASE_URL = databaseUrl.toString();
}

process.env.UI_SMOKE_API_URL = argumentValue("api-url")
  || process.env.UI_SMOKE_API_URL
  || "http://127.0.0.1:4000/api";

async function main() {
  await import("./verify-role-http.js");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
