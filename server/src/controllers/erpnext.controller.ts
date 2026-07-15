import type { Request, Response } from "express";
import { getErpnextOverview, getErpnextStatus, testErpnextConnection } from "../services/erpnext.service.js";

export function erpnextStatusController(_req: Request, res: Response) {
  res.json(getErpnextStatus());
}

export async function testErpnextController(_req: Request, res: Response) {
  res.json(await testErpnextConnection());
}

export async function erpnextOverviewController(_req: Request, res: Response) {
  res.json(await getErpnextOverview());
}
