import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const month = "2026-06";
const systemWaybillHeaders = [
  "运单号",
  "客户订单号",
  "用户",
  "服务",
  "收费重(KG)",
  "供应商收费重(KG)",
  "供应商",
  "供应商服务",
  "收付类型",
  "费用类型",
  "金额",
  "单价",
  "本币费用",
  "销售代表",
  "备注",
  "备注",
  "折合人民币",
  "客服代表",
  "下单时间",
  "内部备注",
  "实重",
  "件数",
  "主品名"
];

type SeedOrder = {
  orderNo: string;
  customerOrderNo: string;
  customerName: string;
  customerType: string;
  salespersonName: string;
  businessType: string;
  supplierName?: string;
  receivable: number;
  payable: number;
  received?: number;
  paid?: number;
  isServiceBusiness?: boolean;
  isCompanyCustomerAdjusted?: boolean;
  needSupervisorConfirm?: boolean;
  note?: string;
};

const orders: SeedOrder[] = [
  { orderNo: "SZ26062469", customerOrderNo: "sz0697", customerName: "zy0811", customerType: "personal", salespersonName: "章佳洁", businessType: "汽运灰关", supplierName: "115", receivable: 25723.08, payable: 23237.77, received: 25128, paid: 22715.71, needSupervisorConfirm: true, note: "利润率低于10%，需复核收入与成本归集" },
  { orderNo: "SZ26062489", customerOrderNo: "sz0701", customerName: "zy0650", customerType: "personal", salespersonName: "章佳洁", businessType: "汽运灰关", supplierName: "115", receivable: 21600, payable: 19880, received: 0, paid: 19880, needSupervisorConfirm: true, note: "利润率低于10%" },
  { orderNo: "SZ26062264", customerOrderNo: "sz0707", customerName: "zy0707", customerType: "company", salespersonName: "章佳洁", businessType: "汽运灰关", supplierName: "115", receivable: 78000, payable: 35500, received: 78000, paid: 35500, isServiceBusiness: true, needSupervisorConfirm: true, note: "公司注册，成交单价大于2.5万" },
  { orderNo: "SZ26061593", customerOrderNo: "sz0688", customerName: "zy0707", customerType: "company", salespersonName: "杨伊雯", businessType: "公司注销", supplierName: "注册服务供应商", receivable: 78000, payable: 35500, received: 78000, paid: 35500, isServiceBusiness: true, needSupervisorConfirm: true, note: "公司注销，主管确认提成" },
  { orderNo: "SZ26061575", customerOrderNo: "sz0665", customerName: "zy0213", customerType: "personal", salespersonName: "朱卓然", businessType: "汽运灰关", supplierName: "A口岸", receivable: 32200, payable: 15800, received: 20000, paid: 15800, needSupervisorConfirm: true, note: "异常高利润，需复核应付成本是否漏录" },
  { orderNo: "SZ26061549", customerOrderNo: "sz0661", customerName: "zy0213", customerType: "personal", salespersonName: "蒋蕊", businessType: "汽运灰关", supplierName: "A口岸", receivable: 43150, payable: 20300, received: 43150, paid: 20300, needSupervisorConfirm: true, note: "异常高利润，需复核应付成本是否漏录" },
  { orderNo: "SZ26061566", customerOrderNo: "sz0663", customerName: "0233", customerType: "personal", salespersonName: "蒋蕊", businessType: "汽运灰关", supplierName: "A口岸", receivable: 18900, payable: 17350, received: 18900, paid: 17350, needSupervisorConfirm: true, note: "利润率低于10%" },
  { orderNo: "SZ26060120", customerOrderNo: "sz0602", customerName: "0233", customerType: "personal", salespersonName: "王霄鱼", businessType: "EAC证书注册", supplierName: "EAC供应商", receivable: 3500, payable: 1040, received: 3500, paid: 1040, isServiceBusiness: true, needSupervisorConfirm: true, note: "EAC证书-DOC，成交单价小于3.5K" },
  { orderNo: "SZ26061174", customerOrderNo: "sz0639", customerName: "宁波鑫达吉进出口有限公司", customerType: "company", salespersonName: "王霄鱼", businessType: "OZ店铺租赁", supplierName: "店铺租赁供应商", receivable: 30900, payable: 24000, received: 30900, paid: 24000, isServiceBusiness: true, needSupervisorConfirm: true, note: "店铺租赁，单价3000/月" },
  { orderNo: "SZ26061011", customerOrderNo: "sz0611", customerName: "zy0650", customerType: "personal", salespersonName: "朱卓然", businessType: "汽运灰关", supplierName: "B口岸", receivable: 49300, payable: 36800, received: 49300, paid: 25000 },
  { orderNo: "SZ26061022", customerOrderNo: "sz0618", customerName: "zy0650", customerType: "personal", salespersonName: "朱卓然", businessType: "汽运灰关", supplierName: "B口岸", receivable: 37200, payable: 28100, received: 37200, paid: 28100 },
  { orderNo: "SZ26061033", customerOrderNo: "sz0622", customerName: "zy0650", customerType: "personal", salespersonName: "朱卓然", businessType: "汽运灰关", supplierName: "B口岸", receivable: 37808, payable: 34017.5, received: 37808, paid: 34017.5, needSupervisorConfirm: true, note: "利润率临界，需复核" },
  { orderNo: "SZ26061201", customerOrderNo: "sz0640", customerName: "zy0811", customerType: "personal", salespersonName: "章佳洁", businessType: "铁路白关整柜", supplierName: "铁路供应商", receivable: 61520, payable: 50200, received: 61520, paid: 50200 },
  { orderNo: "SZ26061202", customerOrderNo: "sz0641", customerName: "zy0811", customerType: "personal", salespersonName: "章佳洁", businessType: "铁路白关整柜", supplierName: "铁路供应商", receivable: 46200, payable: 38400, received: 46200, paid: 38400 },
  { orderNo: "SZ26061203", customerOrderNo: "sz0642", customerName: "zy0811", customerType: "personal", salespersonName: "章佳洁", businessType: "铁路白关整柜", supplierName: "铁路供应商", receivable: 15544.42, payable: 12894.52, received: 15544.42, paid: 12894.52 },
  { orderNo: "SZ26061204", customerOrderNo: "sz0643", customerName: "zy0213", customerType: "personal", salespersonName: "蒋蕊", businessType: "铁路白关整柜", supplierName: "铁路供应商", receivable: 14100, payable: 10100, received: 14100, paid: 10100 },
  { orderNo: "SZ26061205", customerOrderNo: "sz0644", customerName: "0233", customerType: "personal", salespersonName: "蒋蕊", businessType: "铁路白关整柜", supplierName: "铁路供应商", receivable: 11314.25, payable: 10020.63, received: 11314.25, paid: 10020.63 },
  { orderNo: "SZ26061301", customerOrderNo: "sz0650", customerName: "zy0707", customerType: "personal", salespersonName: "朱卓然", businessType: "汽运白关拼车", supplierName: "拼车供应商", receivable: 27117.44, payable: 18543.29, received: 27117.44, paid: 18543.29 },
  { orderNo: "SZ26061302", customerOrderNo: "sz0651", customerName: "zy0730", customerType: "personal", salespersonName: "朱卓然", businessType: "汽运白关拼车", supplierName: "拼车供应商", receivable: 64491.06, payable: 27582.7, received: 64491.06, paid: 27582.7, needSupervisorConfirm: true, note: "异常高利润，需复核成本" },
  { orderNo: "SZ26061303", customerOrderNo: "sz0652", customerName: "zy0213", customerType: "personal", salespersonName: "蒋蕊", businessType: "汽运白关拼车", supplierName: "拼车供应商", receivable: 18000, payable: 13795, received: 18000, paid: 13795 },
  { orderNo: "SZ26061401", customerOrderNo: "sz0660", customerName: "其他客户", customerType: "personal", salespersonName: "杨伊雯", businessType: "汽运灰关", supplierName: "C口岸", receivable: 52600, payable: 38200, received: 40000, paid: 38200 },
  { orderNo: "SZ26061402", customerOrderNo: "sz0662", customerName: "其他客户", customerType: "personal", salespersonName: "杨伊雯", businessType: "汽运灰关", supplierName: "C口岸", receivable: 61300, payable: 43400, received: 61300, paid: 43400 },
  { orderNo: "SZ26061403", customerOrderNo: "sz0664", customerName: "其他客户", customerType: "personal", salespersonName: "杨伊雯", businessType: "汽运灰关", supplierName: "C口岸", receivable: 48700, payable: 35150, received: 48700, paid: 35150 },
  { orderNo: "SZ26061404", customerOrderNo: "sz0666", customerName: "其他客户", customerType: "personal", salespersonName: "王霄鱼", businessType: "汽运灰关", supplierName: "C口岸", receivable: 78100, payable: 59500, received: 50000, paid: 59500 },
  { orderNo: "SZ26061405", customerOrderNo: "sz0667", customerName: "其他客户", customerType: "personal", salespersonName: "王霄鱼", businessType: "汽运灰关", supplierName: "C口岸", receivable: 106667.57, payable: 71145.97, received: 106667.57, paid: 71145.97 }
];

function rateForSalesperson(totalProfit: number) {
  if (totalProfit >= 150000) return 0.3;
  if (totalProfit >= 100000) return 0.25;
  if (totalProfit >= 50000) return 0.2;
  return 0.15;
}

function riskType(rate: number | null, needSupervisorConfirm: boolean) {
  if (rate !== null && rate < 0.1) return "low_profit";
  if (rate !== null && rate > 0.5) return "abnormal_high_profit";
  return needSupervisorConfirm ? "finance_review" : null;
}

function splitReceivable(order: SeedOrder) {
  if (order.isServiceBusiness) {
    return { receivableFreight: 0, receivableClearance: 0, receivableDelivery: 0, otherReceivable: order.receivable };
  }
  return {
    receivableFreight: Math.round(order.receivable * 0.72 * 100) / 100,
    receivableClearance: Math.round(order.receivable * 0.16 * 100) / 100,
    receivableDelivery: Math.round(order.receivable * 0.12 * 100) / 100,
    otherReceivable: 0
  };
}

function splitPayable(order: SeedOrder) {
  if (order.isServiceBusiness) {
    return { payableFreight: 0, payableClearance: 0, payableDelivery: 0, otherCost: order.payable };
  }
  return {
    payableFreight: Math.round(order.payable * 0.76 * 100) / 100,
    payableClearance: Math.round(order.payable * 0.14 * 100) / 100,
    payableDelivery: Math.round(order.payable * 0.1 * 100) / 100,
    otherCost: 0
  };
}

async function main() {
  await prisma.excelImportTemplate.upsert({
    where: { templateKey: "system_waybill_detail" },
    update: {
      fileName: "2026.6月系统运单明细.xlsx",
      sheetName: "7.6系统数据",
      headerRowIndex: 1,
      headersJson: JSON.stringify(systemWaybillHeaders)
    },
    create: {
      templateKey: "system_waybill_detail",
      fileName: "2026.6月系统运单明细.xlsx",
      sheetName: "7.6系统数据",
      headerRowIndex: 1,
      headersJson: JSON.stringify(systemWaybillHeaders)
    }
  });

  await prisma.actionLog.deleteMany({ where: { month } });
  await prisma.exportJob.deleteMany({ where: { month } });
  await prisma.confirmationDocument.deleteMany({ where: { month } });
  await prisma.serviceBusinessRecord.deleteMany({ where: { financeOrder: { month } } });
  await prisma.costAdjustment.deleteMany({ where: { financeOrder: { month } } });
  await prisma.riskRecord.deleteMany({ where: { financeOrder: { month } } });
  await prisma.commissionRecord.deleteMany({ where: { financeOrder: { month } } });
  await prisma.financeSummary.deleteMany({ where: { month } });
  await prisma.financeOrder.deleteMany({ where: { month } });

  const created = [];
  for (const [index, order] of orders.entries()) {
    const grossProfit = order.receivable - order.payable;
    const grossProfitRate = order.receivable > 0 ? grossProfit / order.receivable : null;
    const createdOrder = await prisma.financeOrder.create({
      data: {
        orderNo: order.orderNo,
        customerOrderNo: order.customerOrderNo,
        orderDate: new Date(`2026-06-${String((index % 25) + 1).padStart(2, "0")}T10:00:00.000Z`),
        month,
        customerName: order.customerName,
        customerType: order.customerType,
        salespersonName: order.salespersonName,
        businessType: order.businessType,
        supplierName: order.supplierName,
        currency: "CNY",
        exchangeRate: 1,
        exchangeRateSource: "原始表格标注1，按人民币计算；美元数据按6.85规则折算后入库",
        exchangeRateStatus: "confirmed",
        ...splitReceivable(order),
        ...splitPayable(order),
        adjustedReceivable: order.receivable,
        adjustedPayable: order.payable,
        adjustedGrossProfit: grossProfit,
        adjustedGrossProfitRate: grossProfitRate,
        receivedAmount: order.received ?? 0,
        paidAmount: order.paid ?? 0,
        orderStatus: "completed",
        receivableStatus: (order.received ?? 0) >= order.receivable ? "received" : (order.received ?? 0) > 0 ? "partial" : "unreceived",
        payableStatus: (order.paid ?? 0) >= order.payable ? "paid" : (order.paid ?? 0) > 0 ? "partial" : "unpaid",
        isServiceBusiness: order.isServiceBusiness ?? false,
        isCompanyCustomerAdjusted: order.isCompanyCustomerAdjusted ?? false,
        needSupervisorConfirm: order.needSupervisorConfirm ?? false,
        calculationNote: order.note ?? "2026年6月样例数据，按原始表格汇率与成本规则计算",
        remark: "Render线上测试种子数据"
      }
    });
    created.push(createdOrder);
  }

  const logisticsProfitBySalesperson = new Map<string, number>();
  for (const order of created) {
    if (!order.isServiceBusiness && order.adjustedGrossProfit > 0) {
      logisticsProfitBySalesperson.set(order.salespersonName, (logisticsProfitBySalesperson.get(order.salespersonName) ?? 0) + order.adjustedGrossProfit);
    }
  }

  for (const order of created) {
    const currentRiskType = riskType(order.adjustedGrossProfitRate, order.needSupervisorConfirm);
    if (currentRiskType) {
      await prisma.riskRecord.create({
        data: {
          financeOrderId: order.id,
          riskLevel: currentRiskType === "abnormal_high_profit" ? "medium" : "high",
          riskType: currentRiskType,
          riskReasons: `${order.orderNo}：${order.calculationNote}`,
          suggestion: currentRiskType === "low_profit" ? "复核收入、应付成本和费用归集" : "复核应付成本是否漏录，必要时要求主管确认",
          status: "open"
        }
      });
    }

    if (!order.isServiceBusiness && order.adjustedGrossProfit > 0) {
      const rate = rateForSalesperson(logisticsProfitBySalesperson.get(order.salespersonName) ?? 0);
      await prisma.commissionRecord.create({
        data: {
          financeOrderId: order.id,
          salespersonName: order.salespersonName,
          customerType: order.customerType,
          businessType: order.businessType,
          grossProfit: order.adjustedGrossProfit,
          commissionRate: order.isCompanyCustomerAdjusted ? 0.1 : rate,
          commissionAmount: order.adjustedGrossProfit * (order.isCompanyCustomerAdjusted ? 0.1 : rate),
          needSupervisorConfirm: order.needSupervisorConfirm,
          confirmStatus: "pending"
        }
      });
    }

    if (order.isServiceBusiness) {
      const min = order.businessType.includes("公司") ? 2000 : order.businessType.includes("店铺") ? 700 : 150;
      const max = order.businessType.includes("公司") ? 3500 : order.businessType.includes("店铺") ? 700 : 200;
      await prisma.serviceBusinessRecord.create({
        data: {
          financeOrderId: order.id,
          serviceType: order.businessType,
          originalPrice: order.adjustedReceivable,
          suggestedPrice: order.adjustedReceivable,
          suggestedCommissionMin: min,
          suggestedCommissionMax: max,
          costAmount: order.adjustedPayable,
          grossProfit: order.adjustedGrossProfit,
          supervisorFinalCommission: order.businessType.includes("店铺") ? 700 : undefined,
          confirmStatus: order.businessType.includes("店铺") ? "confirmed" : "pending",
          remark: "注册/证书/店铺服务类业务，主管最终确认"
        }
      });
    }

    if (order.needSupervisorConfirm && !order.isServiceBusiness) {
      await prisma.costAdjustment.create({
        data: {
          financeOrderId: order.id,
          fieldName: "adjustedPayable",
          oldValue: order.adjustedPayable,
          newValue: order.adjustedPayable,
          adjustmentLogic: "风险复查待主管确认",
          reason: order.calculationNote ?? "待复核",
          operatorName: "seed",
          needSupervisorConfirm: true
        }
      });
    }
  }

  const totalReceivable = created.reduce((sum, order) => sum + order.adjustedReceivable, 0);
  const totalPayable = created.reduce((sum, order) => sum + order.adjustedPayable, 0);
  const totalGrossProfit = created.reduce((sum, order) => sum + order.adjustedGrossProfit, 0);
  const totalCommission = (await prisma.commissionRecord.findMany({ where: { financeOrder: { month } } })).reduce((sum, item) => sum + item.commissionAmount, 0);

  await prisma.financeSummary.create({
    data: {
      month,
      totalReceivable,
      totalPayable,
      totalReceived: created.reduce((sum, order) => sum + order.receivedAmount, 0),
      totalPaid: created.reduce((sum, order) => sum + order.paidAmount, 0),
      totalGrossProfit,
      grossProfitRate: totalReceivable > 0 ? totalGrossProfit / totalReceivable : null,
      totalCommission,
      riskOrderCount: created.filter((order) => (order.adjustedGrossProfitRate ?? 1) < 0.1).length,
      abnormalHighProfitOrderCount: created.filter((order) => (order.adjustedGrossProfitRate ?? 0) > 0.5).length,
      pendingSupervisorConfirmCount: created.filter((order) => order.needSupervisorConfirm).length
    }
  });

  await prisma.actionLog.create({
    data: {
      month,
      entityType: "database",
      entityId: month,
      action: "seed_demo_data",
      operator: "system",
      payloadJson: JSON.stringify({ orderCount: created.length, totalReceivable, totalPayable, totalGrossProfit })
    }
  });

  console.log(`Seeded ${created.length} finance orders for ${month}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
