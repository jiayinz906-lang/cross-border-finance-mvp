import dotenv from "dotenv";

dotenv.config();

const localDevTokenSecret = "xjd-finance-local-dev-secret";

if (process.env.NODE_ENV === "production" && !process.env.AUTH_TOKEN_SECRET) {
  throw new Error("AUTH_TOKEN_SECRET is required in production.");
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  authTokenSecret: process.env.AUTH_TOKEN_SECRET || localDevTokenSecret,
  nodeEnv: process.env.NODE_ENV ?? "development",
  authRequireToken: process.env.AUTH_REQUIRE_TOKEN
    ? process.env.AUTH_REQUIRE_TOKEN === "true"
    : true,
  allowHeaderRole: process.env.ALLOW_HEADER_ROLE
    ? process.env.ALLOW_HEADER_ROLE === "true"
    : false,
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5173").split(",").map((value) => value.trim()).filter(Boolean),
  publicAppUrl: (process.env.PUBLIC_APP_URL || "http://localhost:5173/").replace(/\/$/, ""),
  wecomWebhookUrl: process.env.WECOM_WEBHOOK_URL?.trim() || "",
  dingtalkWebhookUrl: process.env.DINGTALK_WEBHOOK_URL?.trim() || "",
  dingtalkWebhookSecret: process.env.DINGTALK_WEBHOOK_SECRET?.trim() || ""
};
