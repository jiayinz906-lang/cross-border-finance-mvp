import { commissionRepository } from "../repositories/commission.repository.js";
import { financeRepository } from "../repositories/finance.repository.js";
import { allFinanceAccess } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";
import { prisma } from "../prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { assertMonthOpen } from "./month-lock.service.js";
import {
  assertConfirmationSnapshotsMutable,
  voidDraftConfirmationSnapshots
} from "./confirmation-snapshot.service.js";
import { workflowService } from "./workflow.service.js";

export const commissionService = {
  async listCommissions(month?: string, scope: FinanceAccessScope = allFinanceAccess) {
    const selectedMonth = month ?? (await financeRepository.getLatestSummary())?.month;
    return commissionRepository.listCommissions(selectedMonth, scope);
  },
  async updateCommissionRate(id: number, commissionRate: number, adjustReason: string | undefined, operator: string) {
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) {
      throw new AppError(400, "INVALID_COMMISSION_RATE", "提成比例必须在 0% 到 100% 之间。");
    }
    const reason = adjustReason?.trim();
    if (!reason) throw new AppError(400, "ADJUST_REASON_REQUIRED", "调整提成比例必须填写原因。");

    const record = await commissionRepository.getCommission(id);
    if (!record) {
      throw new AppError(404, "COMMISSION_NOT_FOUND", "提成记录不存在。");
    }
    await assertMonthOpen(prisma, record.financeOrder.month, "调整提成比例");
    const month = record.financeOrder.month;
    const targets = [
      { documentType: "logistics_commission", ownerName: record.salespersonName },
      { documentType: "sales_salary", ownerName: record.salespersonName }
    ];
    const result = await prisma.$transaction(async (tx) => {
      await assertConfirmationSnapshotsMutable(tx, month, targets);
      const manualCommissionAmount = Math.round(record.grossProfit * commissionRate * 100) / 100;
      const updated = await tx.commissionRecord.update({
        where: { id },
        data: {
          commissionRate,
          manualCommissionAmount,
          commissionAmount: manualCommissionAmount,
          adjustReason: reason,
          confirmStatus: "pending"
        },
        include: { financeOrder: true }
      });
      const records = await tx.commissionRecord.findMany({ where: { financeOrder: { month: updated.financeOrder.month } } });
      const totalCommission = records.reduce((sum, item) => sum + (item.manualCommissionAmount ?? item.commissionAmount), 0);
      await tx.financeSummary.updateMany({ where: { month: updated.financeOrder.month }, data: { totalCommission } });
      const voidedDocumentIds = await voidDraftConfirmationSnapshots(
        tx,
        month,
        targets,
        `订单 ${updated.financeOrder.orderNo} 的物流提成比例已更新，旧确认单自动作废并生成新版本`
      );
      await tx.actionLog.create({
        data: {
          month: updated.financeOrder.month,
          entityType: "commission_record",
          entityId: String(id),
          action: "adjust_commission_rate",
          operator,
          payloadJson: JSON.stringify({
            orderNo: updated.financeOrder.orderNo,
            reason,
            beforeRate: record.commissionRate,
            afterRate: commissionRate,
            beforeAmount: record.manualCommissionAmount ?? record.commissionAmount,
            afterAmount: manualCommissionAmount,
            voidedDocumentIds
          })
        }
      });
      return { row: updated, totalCommission };
    });

    await Promise.all([
      workflowService.generateLogisticsDocuments(month, operator),
      workflowService.generateSalaryDocuments(month, operator)
    ]);
    return result;
  },
  todo: [
    "个人客户订单按毛利 15% 计算",
    "公司客户订单按毛利 10% 计算",
    "主管可调整客户类型",
    "注册、EAC证书、商标注册、店铺租赁等服务类业务进入单独确认表",
    "毛利小于等于 0、订单取消、数据无法确认时不计提成"
  ]
};
