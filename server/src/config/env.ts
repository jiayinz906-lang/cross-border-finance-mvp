import dotenv from "dotenv";

dotenv.config();

const localDevTokenSecret = "xjd-finance-local-dev-secret";
const nodeEnv = process.env.NODE_ENV ?? "development";
const productionProfile = (process.env.PRODUCTION_PROFILE ?? "legacy").trim().toLowerCase();
const authRequireToken = process.env.AUTH_REQUIRE_TOKEN
  ? process.env.AUTH_REQUIRE_TOKEN === "true"
  : true;
const allowHeaderRole = process.env.ALLOW_HEADER_ROLE
  ? process.env.ALLOW_HEADER_ROLE === "true"
  : false;

function positiveNumber(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
}

function booleanValue(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

function listValue(value: string | undefined) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function containsPlaceholder(value: string | undefined) {
  return !value || /CHANGE_ME/i.test(value);
}

if (nodeEnv === "production" && !process.env.AUTH_TOKEN_SECRET) {
  throw new Error("AUTH_TOKEN_SECRET is required in production.");
}
if (nodeEnv === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production.");
}
if (nodeEnv === "production" && (!authRequireToken || allowHeaderRole)) {
  throw new Error("Production requires AUTH_REQUIRE_TOKEN=true and ALLOW_HEADER_ROLE=false.");
}
if (nodeEnv === "production" && process.env.AUTH_TOKEN_SECRET && process.env.AUTH_TOKEN_SECRET.length < 64) {
  throw new Error("AUTH_TOKEN_SECRET must contain at least 64 characters in production.");
}
if (nodeEnv === "production" && booleanValue(process.env.ENABLE_LEGACY_DEFAULT_USERS)) {
  throw new Error("ENABLE_LEGACY_DEFAULT_USERS must be false in production.");
}
if (nodeEnv === "production" && process.env.BOOTSTRAP_ADMIN_PASSWORD && containsPlaceholder(process.env.BOOTSTRAP_ADMIN_PASSWORD)) {
  throw new Error("BOOTSTRAP_ADMIN_PASSWORD still contains CHANGE_ME.");
}

// Provider-specific checks are enabled only for the future Tencent deployment.
// This keeps the existing Render instance operational until the planned cutover.
if (nodeEnv === "production" && productionProfile === "tencent") {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const publicAppUrl = process.env.PUBLIC_APP_URL ?? "";
  const corsOrigins = listValue(process.env.CORS_ALLOWED_ORIGINS);
  const serverName = process.env.SERVER_NAME ?? "";
  if (/localhost|127\.0\.0\.1|render\.com/i.test(databaseUrl)) {
    throw new Error("Tencent production DATABASE_URL must not point to localhost or Render.");
  }
  if (!publicAppUrl.startsWith("https://")) throw new Error("PUBLIC_APP_URL must use HTTPS in Tencent production.");
  if (
    !corsOrigins.length
    || corsOrigins.includes("*")
    || corsOrigins.some((origin) => !origin.startsWith("https://"))
  ) {
    throw new Error("CORS_ALLOWED_ORIGINS must list explicit HTTPS origins.");
  }
  if (!serverName || /example\.com|localhost/i.test(serverName)) throw new Error("SERVER_NAME must be the approved production domain.");
}

export const env = {
  port: positiveNumber(process.env.PORT, 4000, "PORT"),
  databaseUrl: process.env.DATABASE_URL,
  authTokenSecret: process.env.AUTH_TOKEN_SECRET || localDevTokenSecret,
  nodeEnv,
  productionProfile,
  authRequireToken,
  allowHeaderRole,
  uploadMaxMb: positiveNumber(process.env.UPLOAD_MAX_MB, 25, "UPLOAD_MAX_MB"),
  imageUploadMaxMb: positiveNumber(process.env.IMAGE_UPLOAD_MAX_MB, 10, "IMAGE_UPLOAD_MAX_MB"),
  healthDbTimeoutMs: positiveNumber(process.env.HEALTH_DB_TIMEOUT_MS, 5000, "HEALTH_DB_TIMEOUT_MS"),
  slowRequestThresholdMs: positiveNumber(process.env.SLOW_REQUEST_THRESHOLD_MS, 2000, "SLOW_REQUEST_THRESHOLD_MS"),
  httpRequestTimeoutMs: positiveNumber(process.env.HTTP_REQUEST_TIMEOUT_MS, 120000, "HTTP_REQUEST_TIMEOUT_MS"),
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5173").split(",").map((value) => value.trim()).filter(Boolean),
  publicAppUrl: (process.env.PUBLIC_APP_URL || "http://localhost:5173/").replace(/\/$/, ""),
  serverName: process.env.SERVER_NAME?.trim() || "localhost",
  maintenanceMode: booleanValue(process.env.MAINTENANCE_MODE),
  maintenanceMessage: process.env.MAINTENANCE_MESSAGE?.trim() || "系统正在执行维护或数据库迁移，请稍后重试。",
  maintenanceAllowedIps: listValue(process.env.MAINTENANCE_ALLOWED_IPS),
  buildGitSha: process.env.BUILD_GIT_SHA?.trim() || process.env.RENDER_GIT_COMMIT?.trim() || process.env.GITHUB_SHA?.trim() || "local",
  frontendGitSha: process.env.FRONTEND_GIT_SHA?.trim() || process.env.BUILD_GIT_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "local",
  buildTime: process.env.BUILD_TIME?.trim() || "unknown",
  wecomWebhookUrl: process.env.WECOM_WEBHOOK_URL?.trim() || "",
  bootstrapAdminUsername: process.env.BOOTSTRAP_ADMIN_USERNAME?.trim() || "admin",
  bootstrapAdminDisplayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || "系统管理员",
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
  enableLegacyDefaultUsers: nodeEnv !== "production" && process.env.ENABLE_LEGACY_DEFAULT_USERS === "true"
};
