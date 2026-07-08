import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const month = "2026-07";

type SeedOrder = {
  orderNo: string;
  customerName: string;
  customerType: string;
  salespersonName: string;
  businessType: string;
  supplierName?: string;
  currency: string;
  exchangeRate?: number | null;
  exchangeRateSource?: string | null;
  exchangeRateStatus: string;
  receivableFreight?: number;
  receivableClearance?: number;
  receivableDelivery?: number;
  otherReceivable?: number;
  payableFreight?: number;
  payableClearance?: number;
  payableDelivery?: number;
  otherCost?: number;
  receivedAmount?: number;
  paidAmount?: number;
  orderStatus: string;
  receivableStatus: string;
  payableStatus: string;
  isServiceBusiness?: boolean;
  isCompanyCustomerAdjusted?: boolean;
  needSupervisorConfirm?: boolean;
  calculationNote: string;
  remark?: string;
};

const orders: SeedOrder[] = [
  {
    orderNo: "FIN-202607-001",
    customerName: "上海星桥贸易有限公司",
    customerType: "personal",
    salespersonName: "王敏",
    businessType: "跨境物流",
    supplierName: "华东干线供应商",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    receivableFreight: 12000,
    receivableClearance: 1800,
    receivableDelivery: 2400,
    payableFreight: 8800,
    payableClearance: 900,
    payableDelivery: 1500,
    receivedAmount: 16200,
    paidAmount: 11200,
    orderStatus: "completed",
    receivableStatus: "received",
    payableStatus: "paid",
    calculationNote: "正常人民币订单"
  },
  {
    orderNo: "FIN-202607-002",
    customerName: "North Star LLC",
    customerType: "personal",
    salespersonName: "李娜",
    businessType: "跨境物流",
    supplierName: "美线代理 A",
    currency: "USD",
    exchangeRate: null,
    exchangeRateSource: null,
    exchangeRateStatus: "pending",
    receivableFreight: 2200,
    payableFreight: 1600,
    receivedAmount: 0,
    paidAmount: 0,
    orderStatus: "completed",
    receivableStatus: "unreceived",
    payableStatus: "unpaid",
    needSupervisorConfirm: true,
    calculationNote: "USD 汇率缺失，按固定 6.85 口径折算，需主管复核原表标注"
  },
  {
    orderNo: "FIN-202607-003",
    customerName: "广州蓝鲸供应链",
    customerType: "company",
    salespersonName: "陈浩",
    businessType: "清关服务",
    supplierName: "口岸清关供应商",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    receivableFreight: 6800,
    receivableClearance: 2600,
    payableFreight: 5200,
    payableClearance: 0,
    receivedAmount: 5000,
    paidAmount: 5200,
    orderStatus: "completed",
    receivableStatus: "partial",
    payableStatus: "partial",
    needSupervisorConfirm: true,
    calculationNote: "清关成本缺失，默认利润 685 元倒推应付清关成本"
  },
  {
    orderNo: "FIN-202607-004",
    customerName: "杭州优品跨境",
    customerType: "personal",
    salespersonName: "王敏",
    businessType: "派送服务",
    supplierName: "末端派送供应商",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    receivableFreight: 7600,
    receivableDelivery: 3200,
    payableFreight: 6100,
    payableDelivery: 0,
    receivedAmount: 7600,
    paidAmount: 6100,
    orderStatus: "completed",
    receivableStatus: "partial",
    payableStatus: "partial",
    needSupervisorConfirm: true,
    calculationNote: "派送成本缺失，默认利润 685 元倒推应付派送成本"
  },
  {
    orderNo: "FIN-202607-005",
    customerName: "Milan Market SRL",
    customerType: "personal",
    salespersonName: "赵强",
    businessType: "跨境物流",
    supplierName: "欧洲派送商",
    currency: "USD",
    exchangeRate: 6.85,
    exchangeRateSource: "默认 6.85 规则",
    exchangeRateStatus: "confirmed",
    receivableFreight: 1800,
    receivableDelivery: 700,
    payableFreight: 1300,
    payableDelivery: 500,
    receivedAmount: 2500,
    paidAmount: 1800,
    orderStatus: "completed",
    receivableStatus: "received",
    payableStatus: "paid",
    calculationNote: "派送费原始录入 700 美金，按 700 × 6.85 折算"
  },
  {
    orderNo: "FIN-202607-006",
    customerName: "Paris Home SAS",
    customerType: "company",
    salespersonName: "赵强",
    businessType: "跨境物流",
    supplierName: "欧洲派送商",
    currency: "USD",
    exchangeRate: 6.85,
    exchangeRateSource: "默认 6.85 规则",
    exchangeRateStatus: "confirmed",
    receivableFreight: 2100,
    receivableDelivery: 800,
    payableFreight: 1500,
    payableDelivery: 560,
    receivedAmount: 1600,
    paidAmount: 1200,
    orderStatus: "completed",
    receivableStatus: "partial",
    payableStatus: "partial",
    isCompanyCustomerAdjusted: true,
    calculationNote: "派送费原始录入 800 美金，按 800 × 6.85 折算"
  },
  {
    orderNo: "FIN-202607-007",
    customerName: "深圳光年电商",
    customerType: "personal",
    salespersonName: "刘洋",
    businessType: "跨境物流",
    supplierName: "华南干线供应商",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    receivableFreight: 15000,
    payableFreight: 5200,
    receivedAmount: 15000,
    paidAmount: 5200,
    orderStatus: "completed",
    receivableStatus: "received",
    payableStatus: "paid",
    needSupervisorConfirm: true,
    calculationNote: "高毛利异常订单，利润率超过 50%，需要复核"
  },
  {
    orderNo: "FIN-202607-008",
    customerName: "宁波云仓科技",
    customerType: "personal",
    salespersonName: "陈浩",
    businessType: "跨境物流",
    supplierName: "华东干线供应商",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    receivableFreight: 9000,
    payableFreight: 8500,
    receivedAmount: 4000,
    paidAmount: 8500,
    orderStatus: "completed",
    receivableStatus: "partial",
    payableStatus: "paid",
    needSupervisorConfirm: true,
    calculationNote: "低毛利高风险订单，利润率低于 10%"
  },
  {
    orderNo: "FIN-202607-009",
    customerName: "义乌海拓贸易",
    customerType: "company",
    salespersonName: "李娜",
    businessType: "跨境物流",
    supplierName: "美线代理 B",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    receivableFreight: 11000,
    payableFreight: 7900,
    receivedAmount: 0,
    paidAmount: 7900,
    orderStatus: "completed",
    receivableStatus: "unreceived",
    payableStatus: "paid",
    needSupervisorConfirm: true,
    calculationNote: "已完成但未回款订单"
  },
  {
    orderNo: "FIN-202607-010",
    customerName: "青岛北极星贸易",
    customerType: "personal",
    salespersonName: "刘洋",
    businessType: "跨境物流",
    supplierName: "取消订单供应商",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    receivableFreight: 7000,
    payableFreight: 3000,
    receivedAmount: 0,
    paidAmount: 0,
    orderStatus: "cancelled",
    receivableStatus: "cancelled",
    payableStatus: "cancelled",
    calculationNote: "已取消订单，不计入营收、毛利和提成"
  },
  {
    orderNo: "FIN-202607-011",
    customerName: "莫斯科新贸",
    customerType: "service",
    salespersonName: "王敏",
    businessType: "注册业务",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    otherReceivable: 5000,
    otherCost: 1800,
    receivedAmount: 3000,
    paidAmount: 1800,
    orderStatus: "completed",
    receivableStatus: "partial",
    payableStatus: "paid",
    isServiceBusiness: true,
    needSupervisorConfirm: true,
    calculationNote: "注册业务单独成表，主管确认价格和提成"
  },
  {
    orderNo: "FIN-202607-012",
    customerName: "欧亚认证客户",
    customerType: "service",
    salespersonName: "李娜",
    businessType: "EAC证书",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    otherReceivable: 8000,
    otherCost: 3600,
    receivedAmount: 8000,
    paidAmount: 3600,
    orderStatus: "completed",
    receivableStatus: "received",
    payableStatus: "paid",
    isServiceBusiness: true,
    needSupervisorConfirm: true,
    calculationNote: "EAC 证书业务单独确认"
  },
  {
    orderNo: "FIN-202607-013",
    customerName: "品牌出海客户",
    customerType: "service",
    salespersonName: "赵强",
    businessType: "商标注册",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    otherReceivable: 6500,
    otherCost: 2600,
    receivedAmount: 2000,
    paidAmount: 2600,
    orderStatus: "completed",
    receivableStatus: "partial",
    payableStatus: "paid",
    isServiceBusiness: true,
    needSupervisorConfirm: true,
    calculationNote: "商标注册业务单独确认"
  },
  {
    orderNo: "FIN-202607-014",
    customerName: "跨境店铺客户",
    customerType: "service",
    salespersonName: "陈浩",
    businessType: "店铺租赁",
    currency: "CNY",
    exchangeRate: 1,
    exchangeRateSource: "原始台账",
    exchangeRateStatus: "confirmed",
    otherReceivable: 12000,
    otherCost: 7200,
    receivedAmount: 6000,
    paidAmount: 3600,
    orderStatus: "completed",
    receivableStatus: "partial",
    payableStatus: "partial",
    isServiceBusiness: true,
    needSupervisorConfirm: true,
    calculationNote: "店铺租赁业务单独确认"
  }
];

function calcTotals(order: SeedOrder) {
  const rate = order.currency === "USD" ? order.exchangeRate ?? 6.85 : 1;
  const receivable =
    ((order.receivableFreight ?? 0) +
      (order.receivableClearance ?? 0) +
      (order.receivableDelivery ?? 0) +
      (order.otherReceivable ?? 0)) *
    rate;
  const payable =
    ((order.payableFreight ?? 0) +
      (order.payableClearance ?? 0) +
      (order.payableDelivery ?? 0) +
      (order.otherCost ?? 0)) *
    rate;
  const profit = order.orderStatus === "cancelled" ? 0 : receivable - payable;
  return {
    adjustedReceivable: order.orderStatus === "cancelled" ? 0 : receivable,
    adjustedPayable: order.orderStatus === "cancelled" ? 0 : payable,
    adjustedGrossProfit: profit,
    adjustedGrossProfitRate: receivable > 0 && order.orderStatus !== "cancelled" ? profit / receivable : null
  };
}

async function main() {
  await prisma.serviceBusinessRecord.deleteMany();
  await prisma.costAdjustment.deleteMany();
  await prisma.riskRecord.deleteMany();
  await prisma.commissionRecord.deleteMany();
  await prisma.financeSummary.deleteMany();
  await prisma.financeOrder.deleteMany();

  const createdOrders = [];
  for (const order of orders) {
    const totals = calcTotals(order);
    createdOrders.push(
      await prisma.financeOrder.create({
        data: {
          orderDate: new Date("2026-07-06T00:00:00.000Z"),
          month,
          supplierName: order.supplierName ?? null,
          receivableFreight: order.receivableFreight ?? 0,
          receivableClearance: order.receivableClearance ?? 0,
          receivableDelivery: order.receivableDelivery ?? 0,
          otherReceivable: order.otherReceivable ?? 0,
          payableFreight: order.payableFreight ?? 0,
          payableClearance: order.payableClearance ?? 0,
          payableDelivery: order.payableDelivery ?? 0,
          otherCost: order.otherCost ?? 0,
          receivedAmount: order.receivedAmount ?? 0,
          paidAmount: order.paidAmount ?? 0,
          isServiceBusiness: order.isServiceBusiness ?? false,
          isCompanyCustomerAdjusted: order.isCompanyCustomerAdjusted ?? false,
          needSupervisorConfirm: order.needSupervisorConfirm ?? false,
          exchangeRate: order.exchangeRate ?? null,
          exchangeRateSource: order.exchangeRateSource ?? null,
          customerOrderNo: order.orderNo.replace("FIN-", "USR-"),
          remark: order.remark ?? null,
          ...order,
          ...totals
        }
      })
    );
  }

  for (const order of createdOrders) {
    if (!order.isServiceBusiness && order.orderStatus !== "cancelled" && order.adjustedGrossProfit > 0) {
      const rate = order.customerType === "company" || order.isCompanyCustomerAdjusted ? 0.1 : 0.15;
      await prisma.commissionRecord.create({
        data: {
          financeOrderId: order.id,
          salespersonName: order.salespersonName,
          customerType: order.customerType,
          businessType: order.businessType,
          grossProfit: order.adjustedGrossProfit,
          commissionRate: rate,
          commissionAmount: order.adjustedGrossProfit * rate,
          needSupervisorConfirm: order.needSupervisorConfirm,
          confirmStatus: order.needSupervisorConfirm ? "pending" : "confirmed"
        }
      });
    }

    if (order.needSupervisorConfirm || (order.adjustedGrossProfitRate ?? 0) < 0.1 || (order.adjustedGrossProfitRate ?? 0) > 0.5) {
      await prisma.riskRecord.create({
        data: {
          financeOrderId: order.id,
          riskLevel: (order.adjustedGrossProfitRate ?? 0) > 0.5 ? "medium" : "high",
          riskType: (order.adjustedGrossProfitRate ?? 0) > 0.5 ? "abnormal_high_profit" : "finance_risk",
          riskReasons: order.calculationNote ?? "需要主管确认",
          suggestion: "复核原始台账、应收应付和汇率口径。",
          status: "open"
        }
      });
    }

    if (order.payableClearance === 0 && order.receivableClearance > 0) {
      await prisma.costAdjustment.create({
        data: {
          financeOrderId: order.id,
          fieldName: "payableClearance",
          oldValue: 0,
          newValue: Math.max(order.receivableClearance - 685, 0),
          adjustmentLogic: "应收清关费折人民币金额 - 685",
          reason: "清关应付成本缺失",
          operatorName: "seed",
          needSupervisorConfirm: true
        }
      });
    }

    if (order.payableDelivery === 0 && order.receivableDelivery > 0) {
      await prisma.costAdjustment.create({
        data: {
          financeOrderId: order.id,
          fieldName: "payableDelivery",
          oldValue: 0,
          newValue: Math.max(order.receivableDelivery - 685, 0),
          adjustmentLogic: "应收派送费折人民币金额 - 685",
          reason: "派送应付成本缺失",
          operatorName: "seed",
          needSupervisorConfirm: true
        }
      });
    }

    if (order.isServiceBusiness) {
      await prisma.serviceBusinessRecord.create({
        data: {
          financeOrderId: order.id,
          serviceType: order.businessType,
          originalPrice: order.adjustedReceivable,
          suggestedPrice: order.adjustedReceivable,
          suggestedCommissionMin: order.adjustedGrossProfit * 0.08,
          suggestedCommissionMax: order.adjustedGrossProfit * 0.12,
          costAmount: order.adjustedPayable,
          grossProfit: order.adjustedGrossProfit,
          confirmStatus: "pending",
          remark: "服务类业务进入主管确认表，不混入物流提成。"
        }
      });
    }
  }

  const activeOrders = createdOrders.filter((order) => order.orderStatus !== "cancelled");
  const totalReceivable = activeOrders.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const totalPayable = activeOrders.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const totalGrossProfit = activeOrders.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);
  const commissions = await prisma.commissionRecord.findMany();

  await prisma.financeSummary.create({
    data: {
      month,
      totalReceivable,
      totalPayable,
      totalReceived: activeOrders.reduce((sum, order) => sum + order.receivedAmount, 0),
      totalPaid: activeOrders.reduce((sum, order) => sum + order.paidAmount, 0),
      totalGrossProfit,
      grossProfitRate: totalReceivable > 0 ? totalGrossProfit / totalReceivable : null,
      totalCommission: commissions.reduce((sum, item) => sum + item.commissionAmount, 0),
      riskOrderCount: activeOrders.filter((order) => (order.adjustedGrossProfitRate ?? 0) < 0.1 || order.needSupervisorConfirm).length,
      abnormalHighProfitOrderCount: activeOrders.filter((order) => (order.adjustedGrossProfitRate ?? 0) > 0.5).length,
      pendingSupervisorConfirmCount: activeOrders.filter((order) => order.needSupervisorConfirm).length
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
