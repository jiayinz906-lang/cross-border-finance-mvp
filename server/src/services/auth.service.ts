import crypto from "node:crypto";
import type { AppUser } from "@prisma/client";
import { authContext, resolveRole, type UserRole } from "../config/rbac.js";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { AppError } from "../errors/app-error.js";

const tokenSecret = env.authTokenSecret;
const tokenTtlMs = 1000 * 60 * 60 * 12;
const passwordMinLength = 10;

type TokenPayload = {
  sub: number;
  username: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
  exp: number;
};

type UserInput = {
  username: string;
  displayName: string;
  role: UserRole;
  password: string;
};

const defaultUsers: UserInput[] = [
  { username: "admin", displayName: "系统管理员", role: "admin", password: "admin123" },
  { username: "finance", displayName: "财务", role: "finance", password: "finance123" },
  { username: "supervisor", displayName: "主管", role: "supervisor", password: "supervisor123" },
  { username: "boss", displayName: "老板/管理层", role: "executive", password: "boss123" },
  { username: "sales", displayName: "销售/客服", role: "sales", password: "sales123" }
];

function hashPassword(password: string, salt: string) {
  return crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
}

function makePassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPassword(password, salt) };
}

function sign(data: string) {
  return crypto.createHmac("sha256", tokenSecret).update(data).digest("base64url");
}

function encodeToken(payload: TokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function validateUsername(username: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{2,31}$/.test(username)) {
    throw new AppError(400, "INVALID_USERNAME", "账号需为 3-32 位字母开头的字母、数字、点、下划线或短横线。");
  }
}

function validatePassword(password: string) {
  if (password.length < passwordMinLength) {
    throw new AppError(400, "WEAK_PASSWORD", `密码至少需要 ${passwordMinLength} 位。`);
  }
}

function publicUser(user: AppUser) {
  const role = resolveRole(user.role);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    dingtalkUserId: user.dingtalkUserId,
    auth: authContext(role)
  };
}

function createSession(user: AppUser) {
  const role = resolveRole(user.role);
  const payload: TokenPayload = {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    role,
    mustChangePassword: user.mustChangePassword,
    exp: Date.now() + tokenTtlMs
  };
  return {
    token: encodeToken(payload),
    expiresAt: new Date(payload.exp).toISOString(),
    user: publicUser(user)
  };
}

export function parseAuthToken(token?: string | null): TokenPayload | null {
  if (!token) return null;
  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;
  const [body, signature] = raw.split(".");
  if (!body || !signature || sign(body) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return { ...payload, role: resolveRole(payload.role), mustChangePassword: Boolean(payload.mustChangePassword) };
  } catch {
    return null;
  }
}

async function ensureDefaultUsers() {
  for (const user of defaultUsers) {
    const existing = await prisma.appUser.findUnique({ where: { username: user.username } });
    if (existing) continue;
    const password = makePassword(user.password);
    await prisma.appUser.create({
      data: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        passwordHash: password.hash,
        passwordSalt: password.salt,
        mustChangePassword: true
      }
    });
  }
}

async function authLog(action: string, entityId: string, payload: unknown) {
  await prisma.actionLog.create({
    data: {
      entityType: "app_user",
      entityId,
      action,
      operator: entityId,
      payloadJson: JSON.stringify(payload)
    }
  });
}

export const authService = {
  async login(username: string, password: string) {
    await ensureDefaultUsers();
    const user = await prisma.appUser.findUnique({ where: { username } });
    if (!user || !user.isActive || hashPassword(password, user.passwordSalt) !== user.passwordHash) {
      await authLog("login_failed", username || "unknown", { username, reason: "invalid_credentials" });
      throw new AppError(401, "INVALID_CREDENTIALS", "账号或密码错误。");
    }

    const updated = await prisma.appUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });
    await authLog("login_success", String(updated.id), { username: updated.username, role: updated.role });
    return createSession(updated);
  },

  async context(token?: string | null) {
    const payload = parseAuthToken(token);
    if (!payload) return null;
    const user = await prisma.appUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return null;
    return publicUser(user);
  },

  async listUsers() {
    await ensureDefaultUsers();
    const users = await prisma.appUser.findMany({ orderBy: [{ role: "asc" }, { username: "asc" }] });
    return users.map(publicUser);
  },

  async createUser(input: UserInput & { dingtalkUserId?: string }, operator: string) {
    const username = input.username.trim();
    const displayName = input.displayName.trim();
    validateUsername(username);
    validatePassword(input.password);
    if (!displayName) throw new AppError(400, "DISPLAY_NAME_REQUIRED", "请输入显示姓名。");
    const exists = await prisma.appUser.findUnique({ where: { username } });
    if (exists) throw new AppError(409, "USERNAME_EXISTS", "该账号已存在。");
    const password = makePassword(input.password);
    const user = await prisma.appUser.create({
      data: { username, displayName, role: resolveRole(input.role), passwordHash: password.hash, passwordSalt: password.salt, mustChangePassword: true, dingtalkUserId: input.dingtalkUserId?.trim() || null }
    });
    await authLog("create_user", String(user.id), { operator, username, role: user.role });
    return publicUser(user);
  },

  async updateUser(id: number, input: { displayName?: string; role?: UserRole; isActive?: boolean; resetPassword?: string; dingtalkUserId?: string | null }, operator: string, operatorId?: number) {
    const existing = await prisma.appUser.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "USER_NOT_FOUND", "账号不存在。");
    if (operatorId === id && input.isActive === false) throw new AppError(400, "CANNOT_DISABLE_SELF", "不能停用当前登录账号。");

    const data: Record<string, unknown> = {};
    if (input.displayName !== undefined) {
      if (!input.displayName.trim()) throw new AppError(400, "DISPLAY_NAME_REQUIRED", "请输入显示姓名。");
      data.displayName = input.displayName.trim();
    }
    if (input.role !== undefined) data.role = resolveRole(input.role);
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.dingtalkUserId !== undefined) data.dingtalkUserId = input.dingtalkUserId?.trim() || null;
    if (input.resetPassword !== undefined && input.resetPassword !== "") {
      validatePassword(input.resetPassword);
      const password = makePassword(input.resetPassword);
      data.passwordHash = password.hash;
      data.passwordSalt = password.salt;
      data.mustChangePassword = true;
      data.passwordChangedAt = new Date();
    }
    const user = await prisma.appUser.update({ where: { id }, data });
    await authLog("update_user", String(user.id), { operator, changed: Object.keys(data) });
    return publicUser(user);
  },

  async changePassword(userId: number, currentPassword: string, nextPassword: string) {
    const user = await prisma.appUser.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new AppError(401, "INVALID_CREDENTIALS", "账号不可用。");
    if (hashPassword(currentPassword, user.passwordSalt) !== user.passwordHash) throw new AppError(400, "CURRENT_PASSWORD_INVALID", "当前密码不正确。");
    validatePassword(nextPassword);
    const password = makePassword(nextPassword);
    const updated = await prisma.appUser.update({
      where: { id: user.id },
      data: { passwordHash: password.hash, passwordSalt: password.salt, mustChangePassword: false, passwordChangedAt: new Date() }
    });
    await authLog("change_password", String(updated.id), { username: updated.username });
    return createSession(updated);
  }
};
