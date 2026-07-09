import { prisma } from "../prisma/client.js";

type SettlementDirection = "receivable" | "payable";

type SettlementInput = {
  amount: number;
  settledAt?: string;
  operator?: string;
  note?: string;
};

function statusByAmounts(total: number, settled: number, kind: SettlementDirection) {
  if (settled <= 0) return kind === "receivable" ? "unreceived" : "unpaid";
  if (settled + 0.01 >= total) return kind === "receivable" ? "received" : "paid";
  return kind === "receivable" ? "partial_received" : "partial_paid";
}

async function assertMonthOpen(month: string) {
  const close = await prisma.monthClose.findUnique({ where: { month } });
  if (close?.status === "locked") {
    throw new Error(`${month} 已锁账，不能登记收付款。请先由主管解锁并记录原因。`);
  }
}

async function rebuildFinanceSummary(month: string) {
  const orders = await prisma.financeOrder.findMany({ where: { month } });
  const totalReceivable = orders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const totalPayable = orders.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const totalGrossProfit = orders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);
  const commissions = await prisma.commissionRecord.findMany({ where: { financeOrder: { month } } });

  await prisma.financeSummary.upsert({
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

async function writeActionLog(input: {
  month: string;
  entityType: string;
  entityId: string | number;
  action: string;
  operator: string;
  payload: unknown;
}) {
  await prisma.actionLog.create({
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
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("收付款金额必须大于 0。");

  const order = await prisma.financeOrder.findUniqueOrThrow({ where: { id: orderId } });
  await assertMonthOpen(order.month);

  const targetTotal = direction === "receivable" ? order.adjustedReceivable : order.adjustedPayable;
  const currentSettled = direction === "receivable" ? order.receivedAmount : order.paidAmount;
  const nextSettled = Math.min(targetTotal, currentSettled + amount);
  const operator = input.operator || "finance";
  const settledAt = input.settledAt ? new Date(input.settledAt) : new Date();

  const record = await prisma.settlementRecord.create({
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

  const updatedOrder = await prisma.financeOrder.update({
    where: { id: order.id },
    data: direction === "receivable"
      ? {
          receivedAmount: nextSettled,
          receivableStatus: statusByAmounts(order.adjustedReceivable, nextSettled, direction)
        }
      : {
          paidAmount: nextSettled,
          payableStatus: statusByAmounts(order.adjustedPayable, nextSettled, direction)
        }
  });

  await rebuildFinanceSummary(order.month);
  await writeActionLog({
    month: order.month,
    entityType: "settlement_record",
    entityId: record.id,
    action: direction === "receivable" ? "record_receipt" : "record_payment",
    operator,
    payload: {
      orderId: order.id,
      orderNo: order.orderNo,
      amount,
      settledAt: settledAt.toISOString(),
      status: direction === "receivable" ? updatedOrder.receivableStatus : updatedOrder.payableStatus
    }
  });

  return { record, order: updatedOrder };
}

export const settlementService = {
  recordReceipt(orderId: number, input: SettlementInput) {
    return createSettlement(orderId, "receivable", input);
  },

  recordPayment(orderId: number, input: SettlementInput) {
    return createSettlement(orderId, "payable", input);
  },

  listSettlements(month?: string, direction?: SettlementDirection) {
    return prisma.settlementRecord.findMany({
      where: {
        ...(month ? { month } : {}),
        ...(direction ? { direction } : {})
      },
      include: { financeOrder: true },
      orderBy: { id: "desc" },
      take: 200
    });
  }
};
