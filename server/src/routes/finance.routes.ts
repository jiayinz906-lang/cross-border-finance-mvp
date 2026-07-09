import { Router } from "express";
import multer from "multer";
import {
  agentRulesController,
  dashboardController,
  importExcelController,
  importTemplateController,
  listLedgerController,
  monthsController,
  summaryController
} from "../controllers/finance.controller.js";

export const financeRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

financeRoutes.get("/ledger", listLedgerController);
financeRoutes.get("/summary", summaryController);
financeRoutes.get("/dashboard", dashboardController);
financeRoutes.get("/months", monthsController);
financeRoutes.post("/import", upload.single("file"), importExcelController);
financeRoutes.post("/import-template", upload.single("file"), importTemplateController);
financeRoutes.get("/agent/rules", agentRulesController);
