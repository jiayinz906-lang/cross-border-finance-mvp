# cross-border-finance-mvp

轻量级“跨境物流财务管理系统 MVP”，用于替代 Excel 月度财务台账的第一阶段骨架。系统名称为“财务管理系统”。

## 为什么只做财务模块

本项目不是完整 ERP，只聚焦跨境物流 / 跨境电商财务核算、经营分析和管理层财务汇报。第一阶段不做 CRM、库存、采购、人事、权限、登录、复杂审批流和移动端。

## 技术栈

- 前端：React、TypeScript、Vite、Ant Design、React Router、Axios。
- 后端：Node.js、Express、TypeScript、Prisma ORM、SQLite、tsx、dotenv、cors。
- 项目管理：npm workspaces，不使用 pnpm、yarn 或全局 npm 包。

## 为什么使用 SQLite

SQLite 不要求用户本地安装 MySQL、PostgreSQL、Redis、Docker 等额外服务，适合第一阶段本地开发、演示和单人验证。生产环境多人使用时建议迁移到 PostgreSQL，Prisma 可以帮助后续迁移。

## 为什么使用 npm workspaces

client 和 server 是独立子项目，但共享同一个根目录依赖安装和脚本入口。npm workspaces 能减少本地工具要求，并保持 VS Code 打开项目后的开发体验清晰。

## 为什么第一阶段不安装 Excel 和图表依赖

第一阶段目标是固定项目结构、数据库模型、页面模块、服务层职责和 Agent 规则。Excel 导入导出后续再接入，当前不安装 `xlsx`；图表后续再接入，当前不安装 `echarts` 或 `recharts`。

## Agent 文件说明

专用 Agent 规则位于 `agents/finance/finance-fpa-analyst.md`。它定义 FP&A Analyst Agent 的输入工作表、汇率处理、6.85 规则、成本补录、毛利计算、风险识别、提成、服务类业务和数据校验规则。

## 本地运行步骤

```bash
cd cross-border-finance-mvp
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env
```

## 数据库初始化步骤

1. `npm run prisma:generate` 生成 Prisma Client。
2. `npm run prisma:migrate` 初始化 SQLite 数据库。
3. `npm run prisma:seed` 写入覆盖 CNY、USD、汇率缺失、成本缺失、高风险、异常高利润、服务类业务和主管待确认的模拟数据。

## 项目目录说明

- `client/`：React + Vite + Ant Design 前端。
- `server/`：Express + Prisma 后端。
- `prisma/`：Prisma schema 和 seed 数据。
- `agents/finance/`：FP&A Analyst Agent 规则。
- `docs/`：业务流程、数据库、API、页面、计算规则、云端部署和 Agent 说明。
- `scripts/dev.mjs`：使用 Node.js 原生 `child_process` 同时启动前后端，不安装 concurrently。

## 后续开发阶段

第二阶段可继续完善主管确认、报表导出、图表组件和历史导入批次追踪。汇率不接入外部 API，统一按原始 Excel 表格标注执行：`1` 视为人民币，美元/美金/USD/汇率未出按 `6.85`，其他数字汇率按表格标注值。

## 云端部署注意事项

后端端口使用 `PORT`，前端接口地址使用 `VITE_API_BASE_URL`，数据库地址使用 `DATABASE_URL`。前端可部署 GitHub Pages / Vercel / Netlify，后端可部署 Render / Railway / Fly.io / 云服务器。生产环境不需要配置汇率 API Key。

## 环境变量说明

```env
DATABASE_URL="file:./dev.db"
PORT=4000
VITE_API_BASE_URL="http://localhost:4000/api"
```

汇率计算只读取原始 Excel 标注，不使用外部接口。
