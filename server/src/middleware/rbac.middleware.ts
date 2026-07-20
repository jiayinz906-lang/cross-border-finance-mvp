import type { NextFunction, Request, Response } from "express";
import { can, resolveRole } from "../config/rbac.js";
import type { Permission } from "../config/rbac.js";
import { env } from "../config/env.js";
import { parseAuthToken, verifyAuthToken } from "../services/auth.service.js";

type AuthenticatedRequest = Request & {
  financeAuth?: {
    id: number;
    username: string;
    displayName: string;
    role: ReturnType<typeof resolveRole>;
    mustChangePassword: boolean;
  };
};

export function currentRole(req: Request) {
  const authenticated = (req as AuthenticatedRequest).financeAuth;
  if (authenticated) return authenticated.role;
  const payload = parseAuthToken(req.header("authorization"));
  if (payload) return payload.role;
  if (!env.allowHeaderRole) return "sales";
  return resolveRole(req.header("x-finance-role"));
}

export function currentUser(req: Request) {
  const authenticated = (req as AuthenticatedRequest).financeAuth;
  if (authenticated) return authenticated;
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

export async function requireAuthToken(req: Request, res: Response, next: NextFunction) {
  if (!env.authRequireToken || isPublicRequest(req)) {
    next();
    return;
  }

  try {
    const verified = await verifyAuthToken(req.header("authorization"));
    if (!verified) {
      res.status(401).json({
        message: "登录状态已失效，请重新登录。",
        code: "AUTH_TOKEN_REQUIRED"
      });
      return;
    }

    (req as AuthenticatedRequest).financeAuth = {
      id: verified.user.id,
      username: verified.user.username,
      displayName: verified.user.displayName,
      role: resolveRole(verified.user.role),
      mustChangePassword: verified.user.mustChangePassword
    };
    if (verified.user.mustChangePassword && !["/auth/me", "/auth/change-password"].includes(req.path)) {
      res.status(403).json({
        message: "首次登录必须先修改初始密码。",
        code: "PASSWORD_CHANGE_REQUIRED"
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
