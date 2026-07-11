import crypto from "node:crypto";
import { authContext, resolveRole, type UserRole } from "../config/rbac.js";
import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { AppError } from "../errors/app-error.js";

const tokenSecret = env.authTokenSecret;
const tokenTtlMs = 1000 * 60 * 60 * 12;

type TokenPayload = {
  sub: number;
  username: string;
  displayName: string;
  role: UserRole;
  exp: number;
};

const defaultUsers = [
  { username: "admin", displayName: "系统管理员", role: "admin" as UserRole, password: "admin123" },
  { username: "finance", displayName: "财务", role: "finance" as UserRole, password: "finance123" },
  { username: "supervisor", displayName: "主管", role: "supervisor" as UserRole, password: "supervisor123" },
  { username: "boss", displayName: "老板/管理层", role: "executive" as UserRole, password: "boss123" },
  { username: "sales", displayName: "销售/客服", role: "sales" as UserRole, password: "sales123" }
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

export function parseAuthToken(token?: string | null): TokenPayload | null {
  if (!token) return null;
  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;
  const [body, signature] = raw.split(".");
  if (!body || !signature || sign(body) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return { ...payload, role: resolveRole(payload.role) };
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
        passwordSalt: password.salt
      }
    });
  }
}

export const authService = {
  async login(username: string, password: string) {
    await ensureDefaultUsers();
    const user = await prisma.appUser.findUnique({ where: { username } });
    if (!user || !user.isActive) throw new AppError(401, "INVALID_CREDENTIALS", "账号或密码错误。");
    if (hashPassword(password, user.passwordSalt) !== user.passwordHash) throw new AppError(401, "INVALID_CREDENTIALS", "账号或密码错误。");

    await prisma.appUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const role = resolveRole(user.role);
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role,
      exp: Date.now() + tokenTtlMs
    };

    return {
      token: encodeToken(payload),
      expiresAt: new Date(payload.exp).toISOString(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role,
        auth: authContext(role)
      }
    };
  },

  context(token?: string | null) {
    const payload = parseAuthToken(token);
    if (!payload) return null;
    return {
      id: payload.sub,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      auth: authContext(payload.role),
      expiresAt: new Date(payload.exp).toISOString()
    };
  }
};
