import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { assertMonthOpen } from "./month-lock.service.js";
import { allFinanceAccess, scopedFinanceOrderWhere } from "../security/finance-access.js";
import type { FinanceAccessScope } from "../security/finance-access.js";

type SettlementDirection = "receivable" | "payable";

type SettlementInput = {
  amount: number;
  settledAt?: string;
  operator?: string;
  note?: string;
};

type VoidSettlementInput = {
  operator?: string;
  reason?: string;
};

function statusByAmounts(total: number, settled: number, kind: SettlementDirection) {
  if (settled <= 0) return kind === "receivable" ? "unreceived" : "unpaid";
  if (settled + 0.01 >= total) return kind === "receivable" ? "received" : "paid";
  return kind === "receivable" ? "partial_received" : "partial_paid";
}

async function rebuildFinanceSummary(db: Prisma.TransactionClient, month: string) {
  const orders = await db.financeOrder.findMany({ where: { month } });
  const totalReceivable = orders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const totalPayable = orders.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const totalGrossProfit = orders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);
  const commissions = await db.commissionRecord.findMany({ where: { financeOrder: { month } } });

  await db.financeSummary.upsert({
    where: { month },
    update: {
      totalReceivable,
      totalPayable,
      totalReceived: orders.reduce((sum, order) => sum + order.receivedAmount, 0),
      totalPaid: orders.reduce((sum, order) => sum + order.paidAmount, 0),
      totalGrossProfit,
      grossProfitRate: totalReceivable > 0 ? totalGrossProfit / totalReceivable : null,
      totalCommission: commissions.reduce((sum, item) => sum + item.commissionAmount, 0),
      riskOrderCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 1) < 0.1 || order.needSupervisorConfirm).length,
      abnormalHighProfitOrderCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 0) > 0.5).length,
      pendingSupervisorConfirmCount: orders.filter((order) => order.needSupervisorConfirm).length
    },
    create: {
      month,
      totalReceivable,
      totalPayable,
      totalReceived: orders.reduce((sum, order) => sum + order.receivedAmount, 0),
      totalPaid: orders.reduce((sum, order) => sum + order.paidAmount, 0),
      totalGrossProfit,
      grossProfitRate: totalReceivable > 0 ? totalGrossProfit / totalReceivable : null,
      totalCommission: commissions.reduce((sum, item) => sum + item.commissionAmount, 0),
      riskOrderCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 1) < 0.1 || order.needSupervisorConfirm).length,
      abnormalHighProfitOrderCount: orders.filter((order) => (order.adjustedGrossProfitRate ?? 0) > 0.5).length,
      pendingSupervisorConfirmCount: orders.filter((order) => order.needSupervisorConfirm).length
    }
  });
}

async function writeActionLog(db: Prisma.TransactionClient, input: {
  month: string;
  entityType: string;
  entityId: string | number;
  action: string;
  operator: string;
  payload: unknown;
}) {
  await db.actionLog.create({
    data: {
      month: input.month,
      entityType: input.entityType,
      entityId: String(input.entityId),
      action: input.action,
      operator: input.operator,
      payloadJson: JSON.stringify(input.payload)
    }
  });
}

async function createSettlement(orderId: number, direction: SettlementDirection, input: SettlementInput) {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, "INVALID_SETTLEMENT_AMOUNT", "收付款金额必须大于 0。");
  const operator = input.operator || "finance";
  const settledAt = input.settledAt ? new Date(input.settledAt) : new Date();
  if (Number.isNaN(settledAt.getTime())) throw new AppError(400, "INVALID_SETTLEMENT_DATE", "收付款日期格式无效。");

  return prisma.$transaction(async (tx) => {
    const order = await tx.financeOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, "FINANCE_ORDER_NOT_FOUND", "财务订单不存在。");
    await assertMonthOpen(tx, order.month, "登记收付款");

    const targetTotal = direction === "receivable" ? order.adjustedReceivable : order.adjustedPayable;
    const currentSettled = direction === "receivable" ? order.receivedAmount : order.paidAmount;
    const outstanding = Math.max(0, Math.round((targetTotal - currentSettled) * 100) / 100);
    if (outstanding <= 0) throw new AppError(409, "ORDER_ALREADY_SETTLED", "该订单已经结清，不能重复登记。");
    if (amount > outstanding + 0.005) {
      throw new AppError(409, "SETTLEMENT_EXCEEDS_OUTSTANDING", `登记金额超过未结余额，当前最多可登记 ¥${outstanding.toFixed(2)}。`);
    }
    const nextSettled = Math.round((currentSettled + amount) * 100) / 100;
    const record = await tx.settlementRecord.create({
      data: {
        financeOrderId: order.id,
        month: order.month,
        direction,
        amount,
        settledAt,
        counterparty: direction === "receivable" ? order.customerName : order.supplierName,
        operator,
        note: input.note
      }
    });
    const updated = await tx.financeOrder.updateMany({
      where: direction === "receivable"
        ? { id: order.id, receivedAmount: currentSettled }
        : { id: order.id, paidAmount: currentSettled },
      data: direction === "receivable"
        ? { receivedAmount: nextSettled, receivableStatus: statusByAmounts(targetTotal, nextSettled, direction) }
        : { paidAmount: nextSettled, payableStatus: statusByAmounts(targetTotal, nextSettled, direction) }
    });
    if (updated.count !== 1) throw new AppError(409, "SETTLEMENT_CONCURRENT_UPDATE", "订单余额已被其他操作更新，请刷新后重试。");
    const updatedOrder = await tx.financeOrder.findUniqueOrThrow({ where: { id: order.id } });

    await rebuildFinanceSummary(tx, order.month);
    await writeActionLog(tx, {
      month: order.month,
      entityType: "settlement_record",
      entityId: record.id,
      action: direction === "receivable" ? "record_receipt" : "record_payment",
      operator,
      payload: {
        orderId: order.id,
        orderNo: order.orderNo,
        amount,
        beforeSettled: currentSettled,
        afterSettled: nextSettled,
        settledAt: settledAt.toISOString(),
        status: direction === "receivable" ? updatedOrder.receivableStatus : updatedOrder.payableStatus
      }
    });
    return { record, order: updatedOrder };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function voidSettlement(id: number, direction: SettlementDirection, input: VoidSettlementInput = {}) {
  const operator = input.operator || "finance";
  const reason = input.reason?.trim();
  if (!reason) throw new AppError(400, "VOID_REASON_REQUIRED", "作废收付款必须填写原因。");

  return prisma.$transaction(async (tx) => {
    const record = await tx.settlementRecord.findUnique({
      where: { id },
      include: { financeOrder: true, invoiceAllocations: { where: { status: "active" } } }
    });
    if (!record) throw new AppError(404, "SETTLEMENT_NOT_FOUND", "收付款记录不存在。");
    if (record.direction !== direction) throw new AppError(409, "SETTLEMENT_DIRECTION_MISMATCH", "收付款记录类型不匹配。");
    if (record.status === "voided") throw new AppError(409, "SETTLEMENT_ALREADY_VOIDED", "该收付款记录已作废。");
    if (record.invoiceAllocations.length) {
      throw new AppError(409, "SETTLEMENT_HAS_ALLOCATION", "该记录已参与银行核销，请先撤销对应核销记录。");
    }
    await assertMonthOpen(tx, record.month, "作废收付款");

    const order = record.financeOrder;
    const currentSettled = direction === "receivable" ? order.receivedAmount : order.paidAmount;
    const nextSettled = Math.max(0, Math.round((currentSettled - record.amount) * 100) / 100);
    const voided = await tx.settlementRecord.updateMany({
      where: { id, status: "active" },
      data: {
        status: "voided",
        voidedBy: operator,
        voidedAt: new Date(),
        voidReason: reason
      }
    });
    if (voided.count !== 1) throw new AppError(409, "SETTLEMENT_CONCURRENT_UPDATE", "收付款记录状态已变化，请刷新后重试。");
    const updated = await tx.financeOrder.updateMany({
      where: direction === "receivable"
        ? { id: order.id, receivedAmount: currentSettled }
        : { id: order.id, paidAmount: currentSettled },
      data: direction === "receivable"
        ? { receivedAmount: nextSettled, receivableStatus: statusByAmounts(order.adjustedReceivable, nextSettled, direction) }
        : { paidAmount: nextSettled, payableStatus: statusByAmounts(order.adjustedPayable, nextSettled, direction) }
    });
    if (updated.count !== 1) throw new AppError(409, "SETTLEMENT_CONCURRENT_UPDATE", "订单余额已被其他操作更新，请刷新后重试。");
    const [voidedRecord, updatedOrder] = await Promise.all([
      tx.settlementRecord.findUniqueOrThrow({ where: { id } }),
      tx.financeOrder.findUniqueOrThrow({ where: { id: order.id } })
    ]);

    await rebuildFinanceSummary(tx, record.month);
    await writeActionLog(tx, {
      month: record.month,
      entityType: "settlement_record",
      entityId: record.id,
      action: direction === "receivable" ? "void_receipt" : "void_payment",
      operator,
      payload: {
        orderId: order.id,
        orderNo: order.orderNo,
        amount: record.amount,
        reason,
        beforeSettled: currentSettled,
        afterSettled: nextSettled,
        status: direction === "receivable" ? updatedOrder.receivableStatus : updatedOrder.payableStatus
      }
    });
    return { record: voidedRecord, order: updatedOrder };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const settlementService = {
  recordReceipt(orderId: number, input: SettlementInput) {
    return createSettlement(orderId, "receivable", input);
  },

  recordPayment(orderId: number, input: SettlementInput) {
    return createSettlement(orderId, "payable", input);
  },

  voidReceipt(id: number, input: VoidSettlementInput) {
    return voidSettlement(id, "receivable", input);
  },

  voidPayment(id: number, input: VoidSettlementInput) {
    return voidSettlement(id, "payable", input);
  },

  listSettlements(month?: string, direction?: SettlementDirection, scope: FinanceAccessScope = allFinanceAccess) {
    return prisma.settlementRecord.findMany({
      where: {
        ...(month ? { month } : {}),
        ...(direction ? { direction } : {}),
        financeOrder: { is: scopedFinanceOrderWhere({}, scope) }
      },
      include: { financeOrder: true },
      orderBy: { id: "desc" },
      take: 200
    });
  }
};
