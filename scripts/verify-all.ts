import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";

type Step = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const defaultDatabaseUrl = "postgresql://xjd:xjd_local_2026@localhost:54329/xjd_finance?schema=public";
const verificationDatabaseUrl = process.env.VERIFY_DATABASE_URL || defaultDatabaseUrl;
const clientUrl = process.env.UI_SMOKE_CLIENT_URL || "http://localhost:5173/";
const apiUrl = process.env.UI_SMOKE_API_URL || "http://localhost:4000/api";
const isolatedUsername = "finance";
const initialIsolatedPassword = "finance123";
const verifiedIsolatedPassword = "FinanceVerify123!";

const preparationSteps: Step[] = [
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
    name: "Verify role interface and permission matrix",
    command: pnpm,
    args: ["verify:role-matrix"]
  },
  {
    name: "Prepare isolated verification database schema",
    command: pnpm,
    args: ["prisma:deploy"],
    env: { DATABASE_URL: verificationDatabaseUrl }
  },
  {
    name: "Verify import and finance workflow",
    command: pnpm,
    args: ["verify:import"],
    env: {
      DATABASE_URL: verificationDatabaseUrl,
      NODE_ENV: "test",
      ENABLE_LEGACY_DEFAULT_USERS: "true",
      AUTH_TOKEN_SECRET: "xjd-finance-isolated-verification-secret"
    }
  },
  {
    name: "Verify decimal, monthly rules and partner aliases",
    command: pnpm,
    args: ["verify:data-foundation"],
    env: {
      DATABASE_URL: verificationDatabaseUrl,
      NODE_ENV: "test"
    }
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
    const req = client.get(url, { timeout: 5000 }, (res) => {
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

function findAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startIsolatedApi() {
  const port = await findAvailablePort();
  const isolatedApiUrl = `http://127.0.0.1:${port}/api`;
  const child = spawn(process.execPath, ["server/dist/index.js"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: verificationDatabaseUrl,
      PORT: String(port),
      NODE_ENV: "test",
      AUTH_REQUIRE_TOKEN: "true",
      ALLOW_HEADER_ROLE: "false",
      AUTH_TOKEN_SECRET: "xjd-finance-isolated-verification-secret",
      ENABLE_LEGACY_DEFAULT_USERS: "true",
      CORS_ALLOWED_ORIGINS: clientUrl.replace(/\/$/, ""),
      PUBLIC_APP_URL: clientUrl
    }
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Isolated API exited during startup (${child.exitCode}).\n${output.slice(-2000)}`);
    }
    if (await requestOk(`${isolatedApiUrl}/health`)) {
      console.log(`PASS Isolated API: ${isolatedApiUrl}`);
      return { child, apiUrl: isolatedApiUrl };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill("SIGTERM");
  throw new Error(`Isolated API did not become healthy.\n${output.slice(-2000)}`);
}

async function stopIsolatedApi(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function loginVerificationAccount(apiUrl: string, password: string) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: isolatedUsername, password })
  });
  if (!response.ok) return null;
  return await response.json() as {
    token: string;
    user: { mustChangePassword: boolean };
  };
}

async function prepareVerificationAccount(apiUrl: string) {
  const verifiedLogin = await loginVerificationAccount(apiUrl, verifiedIsolatedPassword);
  if (verifiedLogin) return verifiedIsolatedPassword;

  const initialLogin = await loginVerificationAccount(apiUrl, initialIsolatedPassword);
  if (!initialLogin) throw new Error("Unable to login with either verification account password.");
  if (!initialLogin.user.mustChangePassword) return initialIsolatedPassword;

  const response = await fetch(`${apiUrl}/auth/change-password`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${initialLogin.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      currentPassword: initialIsolatedPassword,
      nextPassword: verifiedIsolatedPassword
    })
  });
  if (!response.ok) {
    throw new Error(`Verification account password change failed: ${response.status} ${await response.text()}`);
  }
  console.log("PASS Verification account completed the required first-login password change");
  return verifiedIsolatedPassword;
}

async function ensureRunningServices() {
  console.log("\n==> Check running frontend and API services");
  const [frontendOk, apiOk] = await Promise.all([
    requestOk(clientUrl),
    requestOk(`${apiUrl}/health`)
  ]);

  if (frontendOk && apiOk) {
    console.log(`PASS Frontend: ${clientUrl}`);
    console.log(`PASS API health: ${apiUrl}/health`);
    return;
  }

  if (!frontendOk) console.error(`FAIL Frontend is not reachable: ${clientUrl}`);
  if (!apiOk) console.error(`FAIL API health check failed: ${apiUrl}/health`);
  throw new Error("Please start local services with `pnpm dev` in another terminal, then run `pnpm verify:all` again.");
}

async function main() {
  const verificationUrl = new URL(verificationDatabaseUrl);
  const localDatabase = ["localhost", "127.0.0.1", "::1"].includes(verificationUrl.hostname);
  if (!localDatabase && process.env.ALLOW_NONLOCAL_VERIFY_DB !== "true") {
    throw new Error(
      `Refusing to run mutating verification against non-local database host ${verificationUrl.hostname}. `
      + "Set VERIFY_DATABASE_URL to the isolated local test database, or explicitly set ALLOW_NONLOCAL_VERIFY_DB=true."
    );
  }
  console.log(`Verification database: ${verificationUrl.hostname}:${verificationUrl.port || "5432"}/${verificationUrl.pathname.replace(/^\//, "")}`);

  for (const step of preparationSteps) {
    await runStep(step);
  }

  console.log("\n==> Start isolated verification API");
  const isolatedApi = await startIsolatedApi();
  try {
    const isolatedPassword = await prepareVerificationAccount(isolatedApi.apiUrl);
    const isolatedEnv = {
      DATABASE_URL: verificationDatabaseUrl,
      UI_SMOKE_API_URL: isolatedApi.apiUrl,
      VERIFY_USERNAME: isolatedUsername,
      VERIFY_PASSWORD: isolatedPassword,
      FINANCE_TEST_USERNAME: isolatedUsername,
      FINANCE_TEST_PASSWORD: isolatedPassword
    };
    await runStep({
      name: "Verify manual ledger and image evidence",
      command: pnpm,
      args: ["verify:manual-ledger"],
      env: isolatedEnv
    });
    await runStep({
      name: "Verify finance operations workspace",
      command: pnpm,
      args: ["verify:finance-operations"],
      env: isolatedEnv
    });
    await runStep({
      name: "Verify role routes and self-only data scopes",
      command: pnpm,
      args: ["verify:roles"],
      env: isolatedEnv
    });
    await runStep({
      name: "Verify frontend flows against isolated API",
      command: pnpm,
      args: ["verify:ui"],
      env: {
        ...isolatedEnv,
        UI_SMOKE_CLIENT_URL: clientUrl
      }
    });
  } finally {
    await stopIsolatedApi(isolatedApi.child);
  }

  await ensureRunningServices();
  console.log("\nAll verification checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
