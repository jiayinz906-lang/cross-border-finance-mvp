import type { Request, Response } from "express";
import { requiredCurrentUser } from "../middleware/rbac.middleware.js";
import { businessCaseService } from "../services/business-case.service.js";

const actor = (req: Request) => { const user = requiredCurrentUser(req); return user.displayName || user.username; };

export async function listBusinessCases(req: Request, res: Response) {
  res.json({ rows: await businessCaseService.list({ month: req.query.month as string, caseType: req.query.caseType as string, status: req.query.status as string, keyword: req.query.keyword as string }) });
}
export async function createBusinessCase(req: Request, res: Response) { res.status(201).json(await businessCaseService.create(req.body, actor(req))); }
export async function updateBusinessCase(req: Request, res: Response) { res.json(await businessCaseService.update(Number(req.params.id), req.body, actor(req))); }
export async function commentBusinessCase(req: Request, res: Response) { res.status(201).json(await businessCaseService.addComment(Number(req.params.id), req.body, actor(req))); }
