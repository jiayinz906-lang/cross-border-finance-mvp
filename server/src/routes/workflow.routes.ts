import { Router } from "express";
import {
  actionLogsController,
  confirmServiceRecordController,
  confirmSalespersonCommissionController,
  createExportJobController,
  downloadExportJobController,
  generateLogisticsDocumentsController,
  generateServiceDocumentsController,
  listDocumentsController,
  markRiskReviewedController,
  sendSignatureLinkController,
  signByTokenController,
  supervisorConfirmController,
  voidDocumentController
} from "../controllers/workflow.controller.js";

export const workflowRoutes = Router();

workflowRoutes.get("/documents", listDocumentsController);
workflowRoutes.post("/documents/logistics/generate", generateLogisticsDocumentsController);
workflowRoutes.post("/documents/service/generate", generateServiceDocumentsController);
workflowRoutes.post("/documents/:id/send-signature", sendSignatureLinkController);
workflowRoutes.post("/signature/:token/sign", signByTokenController);
workflowRoutes.post("/documents/:id/supervisor-confirm", supervisorConfirmController);
workflowRoutes.post("/documents/:id/void", voidDocumentController);
workflowRoutes.post("/exports", createExportJobController);
workflowRoutes.get("/exports/:id/download", downloadExportJobController);
workflowRoutes.post("/risks/:id/reviewed", markRiskReviewedController);
workflowRoutes.post("/service-records/:id/confirm", confirmServiceRecordController);
workflowRoutes.post("/commissions/:salespersonName/confirm", confirmSalespersonCommissionController);
workflowRoutes.get("/actions", actionLogsController);
