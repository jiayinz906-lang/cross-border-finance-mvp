import { spawn } from "node:child_process";

const packageManager = process.env.npm_execpath || "pnpm";
const runScript = (script) =>
  spawn(packageManager, ["run", script], { shell: true, stdio: "inherit" });

const children = [
  runScript("dev:server"),
  runScript("dev:client")
];

const stop = (signal) => {
  for (const child of children) {
    child.kill(signal);
  }
  process.exit(0);
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      stop("SIGTERM");
    }
  });
}
