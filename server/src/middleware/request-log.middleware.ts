import type { NextFunction, Request, Response } from "express";

export function requestLogMiddleware(req: Request, _res: Response, next: NextFunction) {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
}
