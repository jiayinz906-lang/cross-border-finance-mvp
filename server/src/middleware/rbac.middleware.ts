import type { NextFunction, Request, Response } from "express";
import { can, resolveRole } from "../config/rbac.js";
import type { Permission } from "../config/rbac.js";
import { parseAuthToken } from "../services/auth.service.js";

export function currentRole(req: Request) {
  const payload = parseAuthToken(req.header("authorization"));
  if (payload) return payload.role;
  return resolveRole(req.header("x-finance-role"));
}

export function currentUser(req: Request) {
  const payload = parseAuthToken(req.header("authorization"));
  if (!payload) return null;
  return {
    id: payload.sub,
    username: payload.username,
    displayName: payload.displayName,
    role: payload.role
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = currentRole(req);
    if (!can(role, permission)) {
      res.status(403).json({
        message: "当前角色无权执行该操作",
        role,
        requiredPermission: permission
      });
      return;
    }
    next();
  };
}
