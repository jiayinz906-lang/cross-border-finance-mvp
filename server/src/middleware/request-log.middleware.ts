import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { recordRequestFinished, recordRequestStarted, sanitizeRequestPath } from "../runtime/operations.js";

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const suppliedRequestId = req.header("x-request-id")?.trim();
  const requestId = suppliedRequestId && suppliedRequestId.length <= 100 ? suppliedRequestId : crypto.randomUUID();
  const path = sanitizeRequestPath(req.path);
  const startedAt = process.hrtime.bigint();
  let recorded = false;

  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  recordRequestStarted();

  const finish = () => {
    if (recorded) return;
    recorded = true;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    recordRequestFinished({
      statusCode: res.statusCode,
      durationMs,
      slowThresholdMs: env.slowRequestThresholdMs
    });
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "http_request",
      requestId,
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      slow: durationMs >= env.slowRequestThresholdMs
    }));
  };

  res.once("finish", finish);
  res.once("close", finish);
  next();
}
