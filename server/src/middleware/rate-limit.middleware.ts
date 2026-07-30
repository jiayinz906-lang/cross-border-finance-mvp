import crypto from "node:crypto";
import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

function ipKey(req: Request) {
  return ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown");
}

function tokenDigest(req: Request) {
  const token = String(req.params.token ?? "");
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 24);
}

function accountDigest(req: Request) {
  const username = String(req.body?.username ?? "unknown").trim().toLowerCase();
  return crypto.createHash("sha256").update(username || "unknown").digest("hex").slice(0, 24);
}

function limiter(input: {
  windowMs: number;
  limit: number;
  keyGenerator: (req: Request) => string;
  code: string;
  message: string;
  skipSuccessfulRequests?: boolean;
}) {
  return rateLimit({
    windowMs: input.windowMs,
    limit: input.limit,
    keyGenerator: input.keyGenerator,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: input.skipSuccessfulRequests ?? false,
    handler: (_req, res) => {
      res.status(429).json({ code: input.code, message: input.message, requestId: String(res.locals.requestId || "") });
    }
  });
}

export const loginIpRateLimit = limiter({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  keyGenerator: ipKey,
  code: "LOGIN_IP_RATE_LIMITED",
  message: "当前网络登录请求过于频繁，请 5 分钟后重试。"
});

export const loginAccountFailureRateLimit = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: accountDigest,
  skipSuccessfulRequests: true,
  code: "LOGIN_ACCOUNT_RATE_LIMITED",
  message: "该账号连续登录失败次数过多，请 15 分钟后重试。"
});

export const signatureIpReadRateLimit = limiter({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  keyGenerator: ipKey,
  code: "SIGNATURE_IP_RATE_LIMITED",
  message: "签名页面访问过于频繁，请稍后重试。"
});

export const signatureTokenReadRateLimit = limiter({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  keyGenerator: tokenDigest,
  code: "SIGNATURE_TOKEN_RATE_LIMITED",
  message: "该签名链接访问过于频繁，请稍后重试。"
});

export const signatureIpWriteRateLimit = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: ipKey,
  code: "SIGNATURE_SUBMIT_RATE_LIMITED",
  message: "签名提交过于频繁，请稍后重试。"
});

export const signatureTokenWriteRateLimit = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: tokenDigest,
  code: "SIGNATURE_TOKEN_SUBMIT_RATE_LIMITED",
  message: "该签名链接提交次数过多，请联系主管重新发送。"
});
