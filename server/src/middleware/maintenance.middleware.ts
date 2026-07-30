import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

const alwaysAvailable = new Set([
  "GET /api/health",
  "POST /api/auth/login"
]);

function normalizedIp(value: string | undefined) {
  return String(value ?? "").trim().replace(/^::ffff:/, "");
}

export function isMaintenanceWriteBlocked(input: {
  enabled: boolean;
  method: string;
  path: string;
  ip?: string;
  allowedIps: string[];
}) {
  if (!input.enabled) return false;
  const method = input.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  if (alwaysAvailable.has(`${method} ${input.path}`)) return false;
  const requestIp = normalizedIp(input.ip);
  return !input.allowedIps.map(normalizedIp).includes(requestIp);
}

export function maintenanceMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isMaintenanceWriteBlocked({
    enabled: env.maintenanceMode,
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
    allowedIps: env.maintenanceAllowedIps
  })) {
    next();
    return;
  }

  res.status(503).json({
    code: "MAINTENANCE_MODE",
    message: env.maintenanceMessage,
    requestId: String(res.locals.requestId || req.header("x-request-id") || "")
  });
}
