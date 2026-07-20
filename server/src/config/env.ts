import dotenv from "dotenv";

dotenv.config();

const localDevTokenSecret = "xjd-finance-local-dev-secret";
const nodeEnv = process.env.NODE_ENV ?? "development";
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

if (nodeEnv === "production" && !process.env.AUTH_TOKEN_SECRET) {
  throw new Error("AUTH_TOKEN_SECRET is required in production.");
}
if (nodeEnv === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production.");
}
if (nodeEnv === "production" && (!authRequireToken || allowHeaderRole)) {
  throw new Error("Production requires AUTH_REQUIRE_TOKEN=true and ALLOW_HEADER_ROLE=false.");
}

export const env = {
  port: positiveNumber(process.env.PORT, 4000, "PORT"),
  databaseUrl: process.env.DATABASE_URL,
  authTokenSecret: process.env.AUTH_TOKEN_SECRET || localDevTokenSecret,
  nodeEnv,
  authRequireToken,
  allowHeaderRole,
  uploadMaxMb: positiveNumber(process.env.UPLOAD_MAX_MB, 25, "UPLOAD_MAX_MB"),
  healthDbTimeoutMs: positiveNumber(process.env.HEALTH_DB_TIMEOUT_MS, 5000, "HEALTH_DB_TIMEOUT_MS"),
  slowRequestThresholdMs: positiveNumber(process.env.SLOW_REQUEST_THRESHOLD_MS, 2000, "SLOW_REQUEST_THRESHOLD_MS"),
  httpRequestTimeoutMs: positiveNumber(process.env.HTTP_REQUEST_TIMEOUT_MS, 120000, "HTTP_REQUEST_TIMEOUT_MS"),
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5173").split(",").map((value) => value.trim()).filter(Boolean),
  publicAppUrl: (process.env.PUBLIC_APP_URL || "http://localhost:5173/").replace(/\/$/, ""),
  wecomWebhookUrl: process.env.WECOM_WEBHOOK_URL?.trim() || "",
  dingtalkWebhookUrl: process.env.DINGTALK_WEBHOOK_URL?.trim() || "",
  dingtalkWebhookSecret: process.env.DINGTALK_WEBHOOK_SECRET?.trim() || "",
  dingtalkAppKey: process.env.DINGTALK_APP_KEY?.trim() || "",
  dingtalkAppSecret: process.env.DINGTALK_APP_SECRET?.trim() || "",
  dingtalkRobotCode: process.env.DINGTALK_ROBOT_CODE?.trim() || "",
  erpnextBaseUrl: (process.env.ERPNEXT_BASE_URL?.trim() || "").replace(/\/$/, ""),
  erpnextApiKey: process.env.ERPNEXT_API_KEY?.trim() || "",
  erpnextApiSecret: process.env.ERPNEXT_API_SECRET?.trim() || "",
  erpnextTimeoutMs: Number(process.env.ERPNEXT_TIMEOUT_MS || 15000)
};
