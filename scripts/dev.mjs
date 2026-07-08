import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "dev:server"], { shell: true, stdio: "inherit" }),
  spawn("npm", ["run", "dev:client"], { shell: true, stdio: "inherit" })
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
