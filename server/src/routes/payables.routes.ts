import { Router } from "express";
import { payablesController, paymentRecordsController, recordPaymentController } from "../controllers/payables.controller.js";

export const payablesRoutes = Router();

payablesRoutes.get("/", payablesController);
payablesRoutes.get("/settlements", paymentRecordsController);
payablesRoutes.post("/:id/payments", recordPaymentController);
