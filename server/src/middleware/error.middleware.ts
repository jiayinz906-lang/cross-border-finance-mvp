import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { env } from "../config/env.js";

function inferredStatus(message: string) {
  const text = message.toLowerCase();
  if (text.includes("expired") || text.includes("过期")) return 410;
  if (text.includes("not found") || text.includes("不存在")) return 404;
  if (text.includes("locked") || text.includes("cannot be") || text.includes("已锁账") || text.includes("已确认") || text.includes("已作废")) return 409;
  if (text.includes("invalid") || text.includes("required") || text.includes("必须") || text.includes("请输入")) return 400;
  return 500;
}

export function errorMiddleware(error: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.header("x-request-id") || crypto.randomUUID();
  const status = error instanceof AppError ? error.statusCode : inferredStatus(error.message);
  const code = error instanceof AppError ? error.code : status === 500 ? "INTERNAL_ERROR" : "BUSINESS_ERROR";
  console.error(`[${requestId}]`, error);
  res.status(status).json({
    code,
    message: status === 500 && env.nodeEnv === "production" ? "系统暂时无法完成该操作，请稍后重试。" : error.message,
    fieldErrors: error instanceof AppError ? error.fieldErrors : undefined,
    requestId
  });
}
