import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

if (process.env.NODE_ENV === "production" || process.env.PRODUCTION_PROFILE === "tencent") {
  throw new Error("prisma migrate dev is disabled in production. Use the explicit prisma:deploy release step.");
}
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "dev", "--name", "init"], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
