import { Router } from "express";
import { receivablesController, receiptRecordsController, recordReceiptController, voidReceiptController } from "../controllers/receivables.controller.js";

export const receivablesRoutes = Router();

receivablesRoutes.get("/", receivablesController);
receivablesRoutes.get("/settlements", receiptRecordsController);
receivablesRoutes.post("/:id/receipts", recordReceiptController);
receivablesRoutes.post("/settlements/:id/void", voidReceiptController);
