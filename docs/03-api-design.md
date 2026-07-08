# API 设计

第一阶段 API 以 mock 和 seed 数据读取为主，保证前后端链路可运行。

## 当前接口

- `GET /api/health`：健康检查。
- `GET /api/finance/ledger`：订单财务台账。
- `GET /api/finance/summary`：月度财务摘要。
- `GET /api/receivables`：应收管理列表。
- `GET /api/payables`：应付管理列表。
- `GET /api/profit/analysis`：毛利分析占位和职责说明。
- `GET /api/commissions`：业务员提成记录。
- `GET /api/risks`：风险记录。
- `GET /api/reports/monthly`：月度报表聚合数据。
- `GET /api/agent/rules`：Agent 规则配置状态。

## 后续正式 API 规划

后续阶段再增加 Excel 导入批次、财务计算触发、手工补录、主管确认、报表导出等写接口。所有数据库访问继续通过 Prisma ORM，不写原生 SQL。
