import type { Request, Response } from "express";
import { authContext } from "../config/rbac.js";
import { currentRole, currentUser } from "../middleware/rbac.middleware.js";
import { authService } from "../services/auth.service.js";

export async function loginController(req: Request, res: Response) {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!username || !password) {
    res.status(400).json({ message: "请输入账号和密码。" });
    return;
  }
  res.json(await authService.login(username, password));
}

export function meController(req: Request, res: Response) {
  const user = currentUser(req);
  const role = currentRole(req);
  res.json({
    user,
    ...authContext(role)
  });
}
