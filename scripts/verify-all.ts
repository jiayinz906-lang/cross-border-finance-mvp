import { spawn } from "node:child_process";

type Step = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const defaultDatabaseUrl = "file:D:/Users/DELL/Documents/财务系统/cross-border-finance-mvp/prisma/dev.db";

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

async function main() {
  for (const step of steps) {
    await runStep(step);
  }
  console.log("\nAll verification checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
