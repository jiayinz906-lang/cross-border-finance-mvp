import crypto from "node:crypto";
import type { AppUser } from "@prisma/client";
import { authContext, resolveAssignableRole, resolveRole, type AssignableUserRole, type UserRole } from "../config/rbac.js";
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
  iat: number;
  exp: number;
};

type UserInput = {
  username: string;
  displayName: string;
  role: AssignableUserRole;
  password: string;
};

type StaffAccountRole = "sales" | "operator" | "sales_operator";

const staffAccountRoles = new Set<UserRole>(["sales", "operator", "sales_operator"]);

const ignoredStaffNames = new Set(["", "-", "未分配", "待主管确认", "未知", "无"]);

const legacyDefaultUsers: UserInput[] = [
  { username: "admin", displayName: "系统管理员", role: "admin", password: "admin12345" },
  { username: "finance", displayName: "财务", role: "finance", password: "finance123" },
  { username: "supervisor", displayName: "主管", role: "supervisor", password: "supervisor123" },
  { username: "boss", displayName: "老板/管理层", role: "executive", password: "boss123456" },
  { username: "sales", displayName: "销售代表", role: "sales", password: "sales12345" },
  { username: "operator", displayName: "操作员", role: "operator", password: "operator12345" }
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

function normalizedStaffName(value: string | null | undefined) {
  const name = String(value ?? "").trim();
  return ignoredStaffNames.has(name) ? "" : name;
}

function generatedInitialPassword() {
  return `Xjd#${crypto.randomBytes(5).toString("hex")}`;
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

function staffAccountSummary(user: AppUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: resolveRole(user.role),
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword
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
    iat: Date.now(),
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
    if (!payload.iat || !payload.exp || payload.exp < Date.now()) return null;
    return { ...payload, role: resolveRole(payload.role), mustChangePassword: Boolean(payload.mustChangePassword) };
  } catch {
    return null;
  }
}

async function ensureBootstrapUsers() {
  if (await prisma.appUser.count()) return;
  const users: UserInput[] = env.enableLegacyDefaultUsers
    ? legacyDefaultUsers
    : env.bootstrapAdminPassword
      ? [{
          username: env.bootstrapAdminUsername,
          displayName: env.bootstrapAdminDisplayName,
          role: "admin",
          password: env.bootstrapAdminPassword
        }]
      : [];
  if (!users.length) {
    throw new AppError(
      503,
      "ADMIN_BOOTSTRAP_REQUIRED",
      "系统尚未创建管理员账号，请先在后端配置 BOOTSTRAP_ADMIN_PASSWORD 后重启服务。"
    );
  }
  for (const user of users) {
    validatePassword(user.password);
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

export async function verifyAuthToken(token?: string | null) {
  const payload = parseAuthToken(token);
  if (!payload) return null;
  const user = await prisma.appUser.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.username !== payload.username) return null;
  if (user.passwordChangedAt && user.passwordChangedAt.getTime() > payload.iat) return null;
  return { payload, user, publicUser: publicUser(user) };
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
    await ensureBootstrapUsers();
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
    return (await verifyAuthToken(token))?.publicUser ?? null;
  },

  async listUsers() {
    await ensureBootstrapUsers();
    const users = await prisma.appUser.findMany({ orderBy: [{ role: "asc" }, { username: "asc" }] });
    return users.map(publicUser);
  },

  async syncStaffUsers(monthInput: string, operator: string) {
    const month = String(monthInput ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, "INVALID_MONTH", "请选择需要同步员工账号的有效月份。");
    }

    const activeBatch = await prisma.importBatch.findFirst({
      where: { month, status: "active" },
      orderBy: { id: "desc" },
      select: { id: true, batchNo: true, fileName: true }
    });
    if (!activeBatch) {
      throw new AppError(409, "ACTIVE_IMPORT_REQUIRED", `${month} 没有当前有效导入批次，不能同步员工账号。`);
    }

    const [orders, activeIdentityOrders] = await Promise.all([
      prisma.financeOrder.findMany({
        where: { month, importBatchId: activeBatch.id },
        select: { salespersonName: true, customerServiceName: true }
      }),
      prisma.financeOrder.findMany({
        where: { importBatch: { is: { status: "active" } } },
        select: { salespersonName: true, customerServiceName: true }
      })
    ]);
    const salesNames = new Set(orders.map((row) => normalizedStaffName(row.salespersonName)).filter(Boolean));
    const operatorNames = new Set(orders.map((row) => normalizedStaffName(row.customerServiceName)).filter(Boolean));
    const activeSalesNames = new Set(activeIdentityOrders.map((row) => normalizedStaffName(row.salespersonName)).filter(Boolean));
    const activeOperatorNames = new Set(activeIdentityOrders.map((row) => normalizedStaffName(row.customerServiceName)).filter(Boolean));
    const desired = Array.from(new Set([...salesNames, ...operatorNames]))
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
      .map((displayName) => ({
        displayName,
        role: activeSalesNames.has(displayName) && activeOperatorNames.has(displayName)
          ? "sales_operator" as const
          : activeSalesNames.has(displayName)
            ? "sales" as const
            : "operator" as const
      }));
    if (!desired.length) {
      throw new AppError(409, "NO_STAFF_IN_IMPORT", `${month} 的有效导入批次中没有销售代表或操作员姓名。`);
    }

    const users = await prisma.appUser.findMany({ orderBy: { id: "asc" } });
    const usernames = new Set(users.map((user) => user.username));
    const nextUsername = (role: StaffAccountRole) => {
      const prefix = role === "sales_operator" ? "staff" : role;
      for (let index = 1; index <= 9999; index += 1) {
        const candidate = `${prefix}${String(index).padStart(3, "0")}`;
        if (!usernames.has(candidate)) {
          usernames.add(candidate);
          return candidate;
        }
      }
      throw new AppError(409, "STAFF_USERNAME_EXHAUSTED", `${role} 员工账号编号已用尽。`);
    };

    const created: Array<ReturnType<typeof staffAccountSummary> & { initialPassword: string }> = [];
    const existing: Array<ReturnType<typeof staffAccountSummary>> = [];
    const mergedAccounts: Array<{
      account: ReturnType<typeof staffAccountSummary>;
      previousRole: UserRole;
      disabledDuplicateAccounts: string[];
    }> = [];
    const disabledDuplicateAccounts: string[] = [];
    for (const staff of desired) {
      const candidates = users
        .filter((user) => staffAccountRoles.has(resolveRole(user.role)) && user.displayName.trim() === staff.displayName)
        .sort((left, right) => {
          const roleRank = (user: AppUser) => {
            const role = resolveRole(user.role);
            if (role === staff.role) return 0;
            if (staff.role === "sales_operator" && role === "sales") return 1;
            if (staff.role === "sales_operator" && role === "operator") return 2;
            if (role === "sales_operator") return 1;
            return 2;
          };
          return Number(right.isActive) - Number(left.isActive) || roleRank(left) - roleRank(right) || left.id - right.id;
        });
      const matched = candidates[0];
      if (matched) {
        const previousRole = resolveRole(matched.role);
        const canonical = previousRole === staff.role && matched.isActive
          ? matched
          : await prisma.appUser.update({
              where: { id: matched.id },
              data: { role: staff.role, isActive: true }
            });
        const duplicates = candidates.slice(1).filter((user) => user.isActive);
        if (duplicates.length) {
          await prisma.appUser.updateMany({
            where: { id: { in: duplicates.map((user) => user.id) } },
            data: { isActive: false }
          });
          disabledDuplicateAccounts.push(...duplicates.map((user) => user.username));
        }
        const summary = staffAccountSummary(canonical);
        existing.push(summary);
        if (previousRole !== staff.role || duplicates.length) {
          mergedAccounts.push({
            account: summary,
            previousRole,
            disabledDuplicateAccounts: duplicates.map((user) => user.username)
          });
        }
        continue;
      }
      const username = nextUsername(staff.role);
      const initialPassword = generatedInitialPassword();
      const password = makePassword(initialPassword);
      const user = await prisma.appUser.create({
        data: {
          username,
          displayName: staff.displayName,
          role: staff.role,
          passwordHash: password.hash,
          passwordSalt: password.salt,
          mustChangePassword: true,
          isActive: true
        }
      });
      users.push(user);
      created.push({ ...staffAccountSummary(user), initialPassword });
    }

    const placeholders = users.filter((user) => (
      user.isActive
      && ((user.username === "sales" && user.role === "sales")
        || (user.username === "operator" && user.role === "operator"))
    ));
    if (placeholders.length) {
      await prisma.appUser.updateMany({
        where: { id: { in: placeholders.map((user) => user.id) } },
        data: { isActive: false }
      });
    }

    await authLog("sync_staff_users", month, {
      operator,
      importBatchNo: activeBatch.batchNo,
      sourceFileName: activeBatch.fileName,
      created: created.map((user) => ({ username: user.username, displayName: user.displayName, role: user.role })),
      existingCount: existing.length,
      mergedAccounts: mergedAccounts.map((row) => ({
        username: row.account.username,
        displayName: row.account.displayName,
        previousRole: row.previousRole,
        role: row.account.role,
        disabledDuplicateAccounts: row.disabledDuplicateAccounts
      })),
      disabledDuplicateAccounts,
      disabledPlaceholderAccounts: placeholders.map((user) => user.username)
    });

    return {
      month,
      importBatchNo: activeBatch.batchNo,
      sourceFileName: activeBatch.fileName,
      created,
      existing,
      mergedAccounts,
      disabledDuplicateAccounts,
      disabledPlaceholderAccounts: placeholders.map((user) => user.username)
    };
  },

  async createUser(input: UserInput & { dingtalkUserId?: string }, operator: string) {
    const username = input.username.trim();
    const displayName = input.displayName.trim();
    validateUsername(username);
    validatePassword(input.password);
    if (!displayName) throw new AppError(400, "DISPLAY_NAME_REQUIRED", "请输入显示姓名。");
    const exists = await prisma.appUser.findUnique({ where: { username } });
    if (exists) throw new AppError(409, "USERNAME_EXISTS", "该账号已存在。");
    const role = resolveAssignableRole(input.role);
    if (!role) throw new AppError(400, "INVALID_ROLE", "请选择有效的账号角色。");
    const password = makePassword(input.password);
    const user = await prisma.appUser.create({
      data: { username, displayName, role, passwordHash: password.hash, passwordSalt: password.salt, mustChangePassword: true, dingtalkUserId: input.dingtalkUserId?.trim() || null }
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
    if (input.role !== undefined) {
      const role = resolveAssignableRole(input.role);
      if (!role) throw new AppError(400, "INVALID_ROLE", "请选择有效的账号角色。");
      data.role = role;
    }
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
