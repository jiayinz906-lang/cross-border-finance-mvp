import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";

type Step = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const defaultDatabaseUrl = "postgresql://xjd:xjd_local_2026@localhost:54329/xjd_finance?schema=public";
const clientUrl = process.env.UI_SMOKE_CLIENT_URL || "http://localhost:5173/";
const apiUrl = process.env.UI_SMOKE_API_URL || "http://localhost:4000/api";

const steps: Step[] = [
  {
    name: "Build server",
    command: pnpm,
    args: ["--filter", "cross-border-finance-server", "build"]
  },
  {
    name: "Build client",
    command: pnpm,
    args: ["--filter", "cross-border-finance-client", "build"]
  },
  {
    name: "Verify import and finance workflow",
    command: pnpm,
    args: ["verify:import"],
    env: { DATABASE_URL: process.env.DATABASE_URL || defaultDatabaseUrl }
  },
  {
    name: "Verify manual ledger and image evidence",
    command: pnpm,
    args: ["verify:manual-ledger"],
    env: { DATABASE_URL: process.env.DATABASE_URL || defaultDatabaseUrl }
  },
  {
    name: "Verify running frontend and API",
    command: pnpm,
    args: ["verify:ui"]
  }
];

function runStep(step: Step) {
  return new Promise<void>((resolve, reject) => {
    console.log(`\n==> ${step.name}`);
    const command = isWindows ? (process.env.ComSpec || "cmd.exe") : step.command;
    const args = isWindows ? ["/d", "/s", "/c", [step.command, ...step.args].join(" ")] : step.args;
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        PATH: process.env.PATH,
        ...step.env
      }
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${step.name} failed with exit code ${code}`));
    });
  });
}

function requestOk(url: string) {
  return new Promise<boolean>((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { timeout: 5000, headers: { "x-finance-role": "admin" } }, (res) => {
      res.resume();
      res.on("end", () => resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 400));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function ensureRunningServices() {
  console.log("\n==> Check running frontend and API services");
  const [frontendOk, apiOk] = await Promise.all([
    requestOk(clientUrl),
    requestOk(`${apiUrl}/health/ready?month=2026-06`)
  ]);

  if (frontendOk && apiOk) {
    console.log(`PASS Frontend: ${clientUrl}`);
    console.log(`PASS API ready: ${apiUrl}/health/ready?month=2026-06`);
    return;
  }

  if (!frontendOk) console.error(`FAIL Frontend is not reachable: ${clientUrl}`);
  if (!apiOk) console.error(`FAIL API readiness check failed: ${apiUrl}/health/ready?month=2026-06`);
  throw new Error("Please start local services with `pnpm dev` in another terminal, then run `pnpm verify:all` again.");
}

async function main() {
  for (const step of steps) {
    if (step.name === "Verify running frontend and API") {
      await ensureRunningServices();
    }
    await runStep(step);
  }
  console.log("\nAll verification checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
