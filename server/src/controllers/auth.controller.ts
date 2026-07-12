import type { Request, Response } from "express";
import { authContext } from "../config/rbac.js";
import { env } from "../config/env.js";
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

export async function meController(req: Request, res: Response) {
  const user = await authService.context(req.header("authorization"));
  if (!user) {
    res.status(401).json({ message: "请先登录后再访问系统。", code: "AUTH_TOKEN_REQUIRED" });
    return;
  }
  const role = currentRole(req);
  res.json({
    user,
    ...authContext(role)
  });
}

export async function changePasswordController(req: Request, res: Response) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ message: "请先登录后再修改密码。" });
    return;
  }
  res.json(await authService.changePassword(user.id, String(req.body?.currentPassword ?? ""), String(req.body?.nextPassword ?? "")));
}

export async function listUsersController(_req: Request, res: Response) {
  res.json({ rows: await authService.listUsers() });
}

export async function createUserController(req: Request, res: Response) {
  const operator = currentUser(req);
  res.status(201).json(await authService.createUser(req.body ?? {}, operator?.displayName ?? operator?.username ?? "管理员"));
}

export async function updateUserController(req: Request, res: Response) {
  const operator = currentUser(req);
  res.json(await authService.updateUser(Number(req.params.id), req.body ?? {}, operator?.displayName ?? operator?.username ?? "管理员", operator?.id));
}

export function notificationStatusController(_req: Request, res: Response) {
  res.json({ provider: "wecom_webhook", configured: Boolean(env.wecomWebhookUrl) });
}
