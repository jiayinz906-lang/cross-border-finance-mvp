# XJD Finance 自托管架构说明

本项目参考 `awesome-selfhosted` 的自托管原则，但不是直接嵌入某个现成财务软件，而是面向跨境物流财务场景实现的一套独立系统。

## 架构

- 前端：React + Vite 静态站点。
- 后端：Node.js + Express API。
- ORM：Prisma。
- 本地数据库：SQLite `prisma/dev.db`。
- 生产数据库：建议 PostgreSQL。
- 健康检查：`/api/health`。
- 就绪检查：`/api/health/ready?month=2026-06`。

## 当前本地端口

- 前端：http://localhost:5173/
- 后端：http://localhost:4000/api

## Excel 导入原则

- 前端只负责上传 Excel 和展示结果。
- 后端负责表头识别、字段映射、汇率口径、应收应付、毛利、风险、提成和确认单派生。
- 固定模板只写入 `ExcelImportTemplate`，不写业务数据。
- 正式导入后，每一行原始台账写入 `RawLedgerLine`。
- 订单、应收、应付、提成和风险都必须能追溯到原始行。

## Agency Agent 接入方式

来源参考：`external_refs/agency-agents-main`

- Finance：`finance-fpa-analyst.md`、`finance-financial-analyst.md`
- Testing：`testing-api-tester.md`、`testing-reality-checker.md`、`testing-test-automation-engineer.md`

这些规则以配置和验收口径接入系统，不作为外部在线 AI 调用。它们用于约束导入、财务分析和测试证据。

## 自托管建议

- 单人本地验证：SQLite 足够。
- 多人真实使用：PostgreSQL。
- 文件备份：定期导出系统备份和数据库备份。
- 服务部署：Docker、Render、Railway、Fly.io 或云服务器。
- 前端部署：Vercel、GitHub Pages、Render Static Site 或 Nginx。

## 验收入口

日常体检：

```powershell
pnpm doctor
```

完整验收：

```powershell
pnpm verify:all
```
