import cors from "cors";
import { Router } from "express";
import {
  actionLogsController,
  confirmServiceRecordController,
  confirmSalespersonCommissionController,
  createExportJobController,
  downloadConfirmationDocumentController,
  downloadExportJobController,
  exportSystemBackupController,
  generateLogisticsDocumentsController,
  generateOperatorDocumentsController,
  generateSalaryDocumentsController,
  generateServiceDocumentsController,
  lockMonthController,
  listDocumentsController,
  markRiskReviewedController,
  monthCloseStatusController,
  monthStatusController,
  markSignatureLinkNotifiedController,
  publicSignatureDocumentController,
  sendSignatureLinkController,
  signByTokenController,
  supervisorConfirmController,
  unlockMonthController,
  voidDocumentController
} from "../controllers/workflow.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const workflowRoutes = Router();
const publicSignatureCors = cors({ origin: true });

// These two token-protected endpoints are intentionally public so an employee
// can open and sign a confirmation from an external phone browser.
workflowRoutes.use("/signature", publicSignatureCors);

workflowRoutes.get("/documents", listDocumentsController);
workflowRoutes.post("/documents/logistics/generate", requirePermission("confirmation:approve"), generateLogisticsDocumentsController);
workflowRoutes.post("/documents/service/generate", requirePermission("confirmation:approve"), generateServiceDocumentsController);
workflowRoutes.post("/documents/operator/generate", requirePermission("confirmation:approve"), generateOperatorDocumentsController);
workflowRoutes.post("/documents/salary/generate", requirePermission("confirmation:approve"), generateSalaryDocumentsController);
workflowRoutes.post("/documents/:id/send-signature", requirePermission("confirmation:approve"), sendSignatureLinkController);
workflowRoutes.post("/documents/:id/mark-notified", requirePermission("confirmation:approve"), markSignatureLinkNotifiedController);
workflowRoutes.get("/signature/:token", publicSignatureDocumentController);
workflowRoutes.post("/signature/:token/sign", signByTokenController);
workflowRoutes.post("/documents/:id/supervisor-confirm", requirePermission("confirmation:approve"), supervisorConfirmController);
workflowRoutes.post("/documents/:id/void", requirePermission("confirmation:approve"), voidDocumentController);
workflowRoutes.get("/documents/:id/download", downloadConfirmationDocumentController);
workflowRoutes.post("/exports", requirePermission("reports:export"), createExportJobController);
workflowRoutes.get("/exports/:id/download", downloadExportJobController);
workflowRoutes.get("/backup/export", requirePermission("reports:export"), exportSystemBackupController);
workflowRoutes.post("/risks/:id/reviewed", requirePermission("risk:review"), markRiskReviewedController);
workflowRoutes.post("/service-records/:id/confirm", requirePermission("confirmation:approve"), confirmServiceRecordController);
workflowRoutes.post("/commissions/:salespersonName/confirm", requirePermission("confirmation:approve"), confirmSalespersonCommissionController);
workflowRoutes.get("/actions", actionLogsController);
workflowRoutes.get("/month-status", monthStatusController);
workflowRoutes.get("/month-close", monthCloseStatusController);
workflowRoutes.post("/month-close/lock", requirePermission("finance:close"), lockMonthController);
workflowRoutes.post("/month-close/unlock", requirePermission("finance:close"), unlockMonthController);
