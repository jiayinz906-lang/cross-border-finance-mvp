import type { Prisma } from "@prisma/client";
import type { UserRole } from "../config/rbac.js";

export type FinanceAccessScope =
  | { mode: "all"; names: string[] }
  | { mode: "self"; names: string[]; field: "salesperson" | "operator" | "both" }
  | { mode: "none"; names: string[] };

export type FinanceAccessField = "salesperson" | "operator";

export const allFinanceAccess: FinanceAccessScope = { mode: "all", names: [] };

export function financeAccessForUser(user: {
  username: string;
  displayName: string;
  role: UserRole;
} | null): FinanceAccessScope {
  if (!user || user.role === "restricted") return { mode: "none", names: [] };
  if (user.role !== "sales" && user.role !== "operator" && user.role !== "sales_operator") return allFinanceAccess;

  const names = Array.from(new Set([user.displayName, user.username].map((value) => value.trim()).filter(Boolean)));
  if (!names.length) return { mode: "none", names: [] };
  if (user.role === "sales_operator") return { mode: "self", names, field: "both" };
  return { mode: "self", names, field: user.role === "sales" ? "salesperson" : "operator" };
}

export function financeAccessForField(
  scope: FinanceAccessScope,
  field: FinanceAccessField
): FinanceAccessScope {
  if (scope.mode !== "self" || scope.field !== "both") return scope;
  return { ...scope, field };
}

export function financeOrderAccessWhere(scope: FinanceAccessScope = allFinanceAccess): Prisma.FinanceOrderWhereInput {
  if (scope.mode === "all") return {};
  if (scope.mode === "none") return { id: -1 };
  if (scope.field === "salesperson") return { salespersonName: { in: scope.names } };
  if (scope.field === "operator") return { customerServiceName: { in: scope.names } };
  return {
    OR: [
      { salespersonName: { in: scope.names } },
      { customerServiceName: { in: scope.names } }
    ]
  };
}

export function scopedFinanceOrderWhere(
  base: Prisma.FinanceOrderWhereInput = {},
  scope: FinanceAccessScope = allFinanceAccess
): Prisma.FinanceOrderWhereInput {
  const access = financeOrderAccessWhere(scope);
  return scope.mode === "all" ? base : { AND: [base, access] };
}

export function ownerAccessWhere(scope: FinanceAccessScope = allFinanceAccess): Prisma.ConfirmationDocumentWhereInput {
  if (scope.mode === "all") return {};
  if (scope.mode === "none") return { id: -1 };
  return { ownerName: { in: scope.names } };
}
