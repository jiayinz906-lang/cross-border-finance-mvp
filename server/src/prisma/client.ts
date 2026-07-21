import { PrismaClient } from "@prisma/client";
import { getAuditContext } from "../audit/audit-context.js";

export const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  if (params.model === "ActionLog" && params.action === "create") {
    const context = getAuditContext();
    const data = params.args?.data as Record<string, unknown> | undefined;
    if (data && context) {
      let payload: Record<string, unknown> | null = null;
      if (typeof data.payloadJson === "string") {
        try {
          payload = JSON.parse(data.payloadJson) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      }
      params.args.data = {
        ...data,
        operator: context.displayName || context.username || data.operator,
        operatorUserId: context.userId ?? data.operatorUserId,
        operatorRole: context.role ?? data.operatorRole,
        ipAddress: context.ipAddress ?? data.ipAddress,
        userAgent: context.userAgent ?? data.userAgent,
        requestId: context.requestId || data.requestId,
        beforeJson: payload && "before" in payload ? JSON.stringify(payload.before) : data.beforeJson,
        afterJson: payload && "after" in payload ? JSON.stringify(payload.after) : data.afterJson
      };
    }
  }
  return next(params);
});
