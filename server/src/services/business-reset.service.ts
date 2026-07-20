import { prisma } from "../prisma/client.js";

export const resetConfirmationPhrase = "RESET_ALL_BUSINESS_DATA";

export type BusinessResetResult = {
  deleted: Record<string, number>;
  preserved: string[];
};

export async function resetBusinessData(operator: string, reason: string): Promise<BusinessResetResult> {
  const deleted = await prisma.$transaction(async (tx) => {
    // Delete children before their parent orders and import batches. PostgreSQL
    // enforces these links, so this sequence is deliberate rather than parallel.
    const settlementRecords = await tx.settlementRecord.deleteMany();
    const ledgerAttachments = await tx.ledgerAttachment.deleteMany();
    const manualLedgerEntries = await tx.manualLedgerEntry.deleteMany();
    const serviceBusinessRecords = await tx.serviceBusinessRecord.deleteMany();
    const costAdjustments = await tx.costAdjustment.deleteMany();
    const riskRecords = await tx.riskRecord.deleteMany();
    const commissionRecords = await tx.commissionRecord.deleteMany();
    const chargeLines = await tx.financeChargeLine.deleteMany();
    const rawLedgerLines = await tx.rawLedgerLine.deleteMany();
    const confirmationDocuments = await tx.confirmationDocument.deleteMany();
    const operatorPerformanceOverrides = await tx.operatorPerformanceOverride.deleteMany();
    const operatorPerformanceMonthSettings = await tx.operatorPerformanceMonthSetting.deleteMany();
    const exportJobs = await tx.exportJob.deleteMany();
    const monthCloses = await tx.monthClose.deleteMany();
    const financeSummaries = await tx.financeSummary.deleteMany();
    const financeOrders = await tx.financeOrder.deleteMany();
    const importBatches = await tx.importBatch.deleteMany();
    const actionLogs = await tx.actionLog.deleteMany();

    return {
      settlementRecords: settlementRecords.count,
      ledgerAttachments: ledgerAttachments.count,
      manualLedgerEntries: manualLedgerEntries.count,
      serviceBusinessRecords: serviceBusinessRecords.count,
      costAdjustments: costAdjustments.count,
      riskRecords: riskRecords.count,
      commissionRecords: commissionRecords.count,
      chargeLines: chargeLines.count,
      rawLedgerLines: rawLedgerLines.count,
      confirmationDocuments: confirmationDocuments.count,
      operatorPerformanceOverrides: operatorPerformanceOverrides.count,
      operatorPerformanceMonthSettings: operatorPerformanceMonthSettings.count,
      exportJobs: exportJobs.count,
      monthCloses: monthCloses.count,
      financeSummaries: financeSummaries.count,
      financeOrders: financeOrders.count,
      importBatches: importBatches.count,
      actionLogs: actionLogs.count
    };
  });

  // Keep a single audit marker so a production reset itself is traceable.
  await prisma.actionLog.create({
    data: {
      entityType: "system",
      entityId: "business-data",
      action: "reset_business_data",
      operator,
      payloadJson: JSON.stringify({ reason, deleted, preserved: ["AppUser", "ExcelImportTemplate", "ParameterRule"] })
    }
  });

  return {
    deleted,
    preserved: ["AppUser", "ExcelImportTemplate", "ParameterRule"]
  };
}
