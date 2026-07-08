import { Router } from "express";
import multer from "multer";
import {
  agentRulesController,
  dashboardController,
  importExcelController,
  listLedgerController,
  summaryController
} from "../controllers/finance.controller.js";

export const financeRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

financeRoutes.get("/ledger", listLedgerController);
financeRoutes.get("/summary", summaryController);
financeRoutes.get("/dashboard", dashboardController);
financeRoutes.post("/import", upload.single("file"), importExcelController);
financeRoutes.get("/agent/rules", agentRulesController);
