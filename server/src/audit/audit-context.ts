import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

export type AuditContext = {
  userId?: number;
  username?: string;
  displayName?: string;
  role?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

const auditContext = new AsyncLocalStorage<AuditContext>();

type AuthenticatedRequest = Request & {
  financeAuth?: {
    id: number;
    username: string;
    displayName: string;
    role: string;
  };
};

export function getAuditContext() {
  return auditContext.getStore();
}

export function auditContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).financeAuth;
  auditContext.run({
    userId: user?.id,
    username: user?.username,
    displayName: user?.displayName,
    role: user?.role,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.header("user-agent")?.slice(0, 1000),
    requestId: String(res.locals.requestId || req.header("x-request-id") || "").slice(0, 100)
  }, next);
}
