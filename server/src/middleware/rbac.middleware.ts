import type { NextFunction, Request, Response } from "express";
import { can, resolveRole } from "../config/rbac.js";
import type { Permission } from "../config/rbac.js";
import { env } from "../config/env.js";
import { parseAuthToken } from "../services/auth.service.js";

export function currentRole(req: Request) {
  const payload = parseAuthToken(req.header("authorization"));
  if (payload) return payload.role;
  if (!env.allowHeaderRole) return "sales";
  return resolveRole(req.header("x-finance-role"));
}

export function currentUser(req: Request) {
  const payload = parseAuthToken(req.header("authorization"));
  if (!payload) return null;
  return {
    id: payload.sub,
    username: payload.username,
    displayName: payload.displayName,
    role: payload.role,
    mustChangePassword: payload.mustChangePassword
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = currentRole(req);
    if (!can(role, permission)) {
      res.status(403).json({
        message: `当前角色无权执行该操作，需要权限：${permission}。请使用管理员、财务或已授权主管账号。`,
        role,
        requiredPermission: permission
      });
      return;
    }
    next();
  };
}

function isPublicRequest(req: Request) {
  if (req.method === "OPTIONS") return true;
  if (req.path === "/health" || req.path === "/health/ready") return true;
  if (req.method === "POST" && req.path === "/auth/login") return true;
  if (req.method === "GET" && /^\/workflow\/signature\/[^/]+$/.test(req.path)) return true;
  if (req.method === "POST" && /^\/workflow\/signature\/[^/]+\/sign$/.test(req.path)) return true;
  return false;
}

export function requireAuthToken(req: Request, res: Response, next: NextFunction) {
  if (!env.authRequireToken || isPublicRequest(req)) {
    next();
    return;
  }

  const payload = parseAuthToken(req.header("authorization"));
  if (!payload) {
    res.status(401).json({
      message: "Please log in before accessing finance system data.",
      code: "AUTH_TOKEN_REQUIRED"
    });
    return;
  }

  next();
}
