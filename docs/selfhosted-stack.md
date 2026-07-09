# XJD Finance 自托管栈说明

来源参考：`external_refs/awesome-selfhosted-master/README.md`

本项目不是直接嵌入 awesome-selfhosted 中的某个成品财务软件，而是按自托管原则落地为一套独立业务系统：

- 前端：React + Vite 静态站点，可部署到 GitHub Pages、Vercel、Render Static Site 或 Nginx。
- 后端：Node.js + Express API，负责 Excel 解析、字段映射、汇总计算、风险识别、确认单和导出。
- 数据库：Prisma ORM。本地使用 SQLite `prisma/dev.db`，生产多用户环境建议迁移 PostgreSQL。
- 运行证据：`/api/health`、前端 200 响应、GitHub Actions 构建和数据库落库结果。

## Excel 导入原则

- 前端只负责上传 Excel。
- 后端自动识别表头，并把 Excel 原始列映射到系统标准字段。
- 导入结果返回字段映射、模板差异、agency finance/testing 规则和自托管栈信息。
- 模板表头只写入 `ExcelImportTemplate`，不写业务数据。

## Agency Agent 接入

来源参考：`external_refs/agency-agents-main`

- Finance：`finance-fpa-analyst.md`、`finance-financial-analyst.md`
- Testing：`testing-api-tester.md`、`testing-reality-checker.md`、`testing-test-automation-engineer.md`

这些 agent 规则以后端配置形式接入，用于约束导入口径和测试证据，不作为外部在线 AI 调用。
