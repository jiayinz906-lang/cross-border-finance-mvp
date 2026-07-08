# 数据库设计

当前使用 SQLite + Prisma，第一阶段采用财务最小模型。

## FinanceOrder

订单财务台账主表，记录订单、客户、业务员、业务类型、币种、应收、应付、调整后毛利、毛利率、回款、付款、状态、主管确认和计算说明。

## FinanceSummary

月度财务汇总表，记录应收、应付、已收、已付、毛利、毛利率、提成、风险订单数、异常高利润订单数和待主管确认订单数。

## CommissionRecord

业务员提成记录，关联 FinanceOrder，记录业务员、客户类型、毛利、提成比例、提成金额和确认状态。

## RiskRecord

财务风险记录，关联 FinanceOrder，记录风险级别、风险类型、原因、建议和处理状态。

## CostAdjustment

成本补录记录，关联 FinanceOrder，记录补录字段、旧值、新值、调整逻辑、原因、操作人和主管确认状态。

## ServiceBusinessRecord

服务类业务确认表，关联 FinanceOrder，覆盖注册、EAC证书、商标注册、店铺租赁等非物流提成业务。

## 后续扩展

后续可扩展 `ExcelImportBatch`、`ReportExportRecord`、`ImportRuleSnapshot` 等模型，记录导入批次、导出文件和当次执行的计算口径。
