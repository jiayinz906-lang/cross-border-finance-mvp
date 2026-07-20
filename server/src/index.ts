import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("express-async-errors");

const [{ app }, { env }] = await Promise.all([
  import("./app.js"),
  import("./config/env.js")
]);
const [{ prisma }, { recordOperationalError }] = await Promise.all([
  import("./prisma/client.js"),
  import("./runtime/operations.js")
]);

const server = app.listen(env.port, () => {
  console.log(`cross-border-finance-server listening on port ${env.port}`);
});

server.requestTimeout = env.httpRequestTimeoutMs;
server.keepAliveTimeout = 65_000;
server.headersTimeout = Math.max(70_000, env.httpRequestTimeoutMs + 5_000);

let shuttingDown = false;

function shutdown(signal: string, exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: "shutdown_started", signal, exitCode }));

  const forceExit = setTimeout(() => {
    recordOperationalError(new Error("Graceful shutdown timed out."), {
      scope: "process",
      operation: "forced_shutdown",
      metadata: { signal, exitCode }
    });
    process.exit(exitCode);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (error) {
      recordOperationalError(error, { scope: "process", operation: "database_disconnect" });
    } finally {
      clearTimeout(forceExit);
      process.exit(exitCode);
    }
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM", 0));
process.once("SIGINT", () => shutdown("SIGINT", 0));
process.once("unhandledRejection", (reason) => {
  recordOperationalError(reason, { scope: "process", operation: "unhandled_rejection" });
  shutdown("unhandledRejection", 1);
});
process.once("uncaughtException", (error) => {
  recordOperationalError(error, { scope: "process", operation: "uncaught_exception" });
  shutdown("uncaughtException", 1);
});
