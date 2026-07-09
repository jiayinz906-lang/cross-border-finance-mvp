import { Router } from "express";
import {
  actionLogsController,
  confirmServiceRecordController,
  confirmSalespersonCommissionController,
  createExportJobController,
  downloadConfirmationDocumentController,
  downloadExportJobController,
  generateLogisticsDocumentsController,
  generateServiceDocumentsController,
  lockMonthController,
  listDocumentsController,
  markRiskReviewedController,
  monthCloseStatusController,
  sendSignatureLinkController,
  signByTokenController,
  supervisorConfirmController,
  unlockMonthController,
  voidDocumentController
} from "../controllers/workflow.controller.js";
import { requirePermission } from "../middleware/rbac.middleware.js";

export const workflowRoutes = Router();

workflowRoutes.get("/documents", listDocumentsController);
workflowRoutes.post("/documents/logistics/generate", generateLogisticsDocumentsController);
workflowRoutes.post("/documents/service/generate", generateServiceDocumentsController);
workflowRoutes.post("/documents/:id/send-signature", sendSignatureLinkController);
workflowRoutes.post("/signature/:token/sign", signByTokenController);
workflowRoutes.post("/documents/:id/supervisor-confirm", supervisorConfirmController);
workflowRoutes.post("/documents/:id/void", voidDocumentController);
workflowRoutes.get("/documents/:id/download", downloadConfirmationDocumentController);
workflowRoutes.post("/exports", createExportJobController);
workflowRoutes.get("/exports/:id/download", downloadExportJobController);
workflowRoutes.post("/risks/:id/reviewed", markRiskReviewedController);
workflowRoutes.post("/service-records/:id/confirm", confirmServiceRecordController);
workflowRoutes.post("/commissions/:salespersonName/confirm", confirmSalespersonCommissionController);
workflowRoutes.get("/actions", actionLogsController);
workflowRoutes.get("/month-close", monthCloseStatusController);
workflowRoutes.post("/month-close/lock", requirePermission("finance:close"), lockMonthController);
workflowRoutes.post("/month-close/unlock", requirePermission("finance:close"), unlockMonthController);
