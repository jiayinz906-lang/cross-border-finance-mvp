# XJD Finance UI

## 生产能力概览（2026-07）

- 新增“财务工作台”：统一处理待办任务、客户/供应商主数据、应收应付账单和银行流水对账。
- 账单由当前月份最新有效 Excel 批次自动同步，原始金额仍以 `RawLedgerLine` / `FinanceChargeLine` 为唯一追溯来源。
- 图片流水和手工流水可自动进入银行流水池，通过金额与往来单位推荐匹配；确认匹配后复用现有收付款核销记录。
- 客户、供应商、账单、流水和待办列表使用后端分页，避免数据量增长后一次加载全部记录。
- 生产环境不再自动创建弱口令账号。空数据库首次启动前必须配置 `BOOTSTRAP_ADMIN_PASSWORD`，首次登录必须修改密码。
- 数据库使用 Prisma 迁移。已有 PostgreSQL 首次部署会同步当前结构并登记迁移基线，之后只执行待发布迁移。

生产环境至少配置：

```env
DATABASE_URL=<PostgreSQL connection string>
AUTH_REQUIRE_TOKEN=true
ALLOW_HEADER_ROLE=false
AUTH_TOKEN_SECRET=<long random secret>
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_DISPLAY_NAME=系统管理员
BOOTSTRAP_ADMIN_PASSWORD=<strong initial password>
ENABLE_LEGACY_DEFAULT_USERS=false
```

跨境物流 / 注册服务月度财务分析系统。系统把 Excel 原始台账导入数据库，并生成经营总览、业务利润、物流提成、注册确认、电子签名确认、操作员绩效、客户利润分析、风险复查、上游应付、参数规则和原始数据追溯。

## 当前能力

- Excel 自动表头映射、导入预检、确认写入数据库。
- 后台保存固定表头模板，只保存表头规范，不写入模板业务数据。
- 原始 Excel 每一行写入 `RawLedgerLine`，订单汇总可追溯回原始台账。
- 支持手工原始流水与图片凭证录入，图片直接持久化到 PostgreSQL，并保留确认、作废和操作审计。
- 应收、应付、毛利、风险、提成按单票明细聚合。
- 物流业务和注册 / 证书 / 店铺租赁等服务类业务分开核算。
- 汇率严格按原始表格标注：人民币按 1，美金 / 美元 / USD / 汇率未出按 6.85，其余按表格标注。
- 参数规则、导入批次、确认单、签名证据、操作日志和系统备份均写入数据库。
- 员工个人确认单支持生成、签名 token、员工签收、主管确认和证据留存。
- 一键验收覆盖构建、导入、表头模板、应收应付、风险复查、提成、确认单、月结锁账和前后端可用性。
- 运行状态包含数据库延迟、请求耗时、慢请求、内存、最近错误和部署版本；日志使用请求 ID 串联且自动隐藏签名 token 与敏感配置。

## 技术栈

- 前端：React、TypeScript、Vite、Ant Design、React Router、Axios
- 后端：Node.js、Express、TypeScript、Prisma ORM
- 数据库：PostgreSQL 17（本地 Docker 与生产统一）
- 运行结构：Nginx + Node.js 后端 + PostgreSQL，SQLite 仅保留历史验证脚本

## 本地一键启动

在 PowerShell 中运行：

```powershell
cd D:\Users\DELL\Documents\财务系统\cross-border-finance-mvp
.\start-finance-local.ps1
```

当前推荐使用 Docker 开发栈：

```powershell
docker compose --env-file .env.docker -f docker-compose.dev.yml up -d --build
```

它会启动 PostgreSQL、后端 `4000` 和前端 `5173`，数据库数据保存在 Docker 命名卷 `postgres_dev_data` 中。`start-finance-local.ps1` 仍可用于已有本机 PostgreSQL 的宿主机开发模式。

如不希望脚本释放端口：

```powershell
.\start-finance-local.ps1 -NoRestartPorts
```

## 当前本地地址

- 前端网页：http://localhost:5173/
- 经营总览：http://localhost:5173/#/dashboard
- 原始数据录入：http://localhost:5173/#/raw-entry
- 后端 API：http://localhost:4000/api
- 健康检查：http://localhost:4000/api/health
- 就绪检查：http://localhost:4000/api/health/ready
- 运维状态（登录后）：http://localhost:4000/api/health/status

## 首次安装或数据库同步

```powershell
pnpm install
pnpm prisma:deploy
```

## Excel 表头模板

当前后台模板 Key：

```text
system_waybill_detail
```

固定表头来自 `表头模版.xlsx`，共 23 列：

```text
运单号
客户订单号
用户
服务
收费重(KG)
供应商收费重(KG)
供应商
供应商服务
收付类型
费用类型
金额
单价
本币费用
销售代表
备注
备注
折合人民币
客服代表
下单时间
内部备注
实重
件数
主品名
```

上传模板只会写入 `ExcelImportTemplate`，不会导入业务数据。后续 Excel 导入会按这份模板做字段映射、缺失表头校验和模板差异记录。

## 验收测试

完整验收前，请保持 `pnpm dev` 或 `.\start-finance-local.ps1` 启动的前后端服务正在运行。

默认读取桌面文件 `2026.6月系统运单明细.xlsx`。也可以用 `IMPORT_VERIFY_FILE` 指定其他 Excel：

```powershell
$env:IMPORT_VERIFY_FILE='D:/Users/DELL/Desktop/2026.6月系统运单明细.xlsx'
pnpm verify:all
```

单独验收：

```powershell
pnpm doctor
pnpm doctor:docker
pnpm verify:import
pnpm verify:ui
pnpm verify:ui:docker
```

`pnpm doctor` 是非破坏性体检命令：不重新导入 Excel、不改数据库，只检查前端、后端、数据库就绪、固定表头模板和仪表盘汇总是否可用。它优先使用 `FINANCE_TEST_USERNAME` / `FINANCE_TEST_PASSWORD`；`pnpm doctor:docker` 会读取本机 `.env.production` 并检查 `http://localhost/`。月份自动采用数据库最新有效月份，空数据库会显示为“待首次导入”。

`pnpm verify:all` 覆盖：

- 后端构建
- 前端构建
- Excel 预检和正式导入
- 固定表头模板读取
- 原始台账逐行落库
- 应收、应付、毛利和汇总一致性
- 物流 / 服务类拆分
- 风险复查
- 物流提成和服务类确认
- 个人确认单生成、员工签名、主管确认和证据链
- 应收应付收付款登记和作废
- 月结锁账、解锁、锁账后禁止导入
- 前端页面、后端健康检查和数据库就绪检查

## 常用命令

```powershell
pnpm dev
pnpm --filter cross-border-finance-server build
pnpm --filter cross-border-finance-client build
pnpm doctor
pnpm doctor:docker
pnpm backup:system
pnpm backup:db
pnpm verify:db-backup
pnpm verify:all
pnpm verify:import
pnpm verify:ui
pnpm verify:operations
pnpm prisma:deploy
```

`pnpm verify:operations` 验证敏感信息脱敏、签名链接隐藏、请求耗时统计和错误计数。参数规则页的“系统运行与就绪状态”用于查看数据库延迟、P95 请求耗时、慢请求、内存和最近错误请求 ID。

运行稳定性与运维设计参考了 MIT 许可的 [BaiLongma](https://github.com/xiaoyuanda666-ship-it/BaiLongma)，许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 系统备份

网页端可以在“参数规则”页面导出本月或全量系统备份 Excel。命令行也可以直接导出：

```powershell
pnpm backup:system
```

默认导出全部月份到 `outputs/backups/`。如只需归档一个月份，可用环境变量指定：

```powershell
$env:BACKUP_MONTH='2026-06'
$env:BACKUP_OUTPUT_DIR='D:/Users/DELL/Desktop'
pnpm backup:system
```

系统备份 Excel 包含月度汇总、导入批次、表头模板、参数规则、锁账状态、确认单、操作日志和导出记录；它用于审计和关键配置归档，不替代生产数据库全量备份。

PostgreSQL 全量归档：

```powershell
pnpm backup:db
```

命令从本机 `docker-compose.prod.yml` 的 PostgreSQL 容器生成 custom-format `pg_dump`，保存到 `outputs/db-backups/`，同时生成 SHA-256 和元数据文件。归档完成后会立即使用 `pg_restore --list` 做只读结构校验。

再次验证最近一次归档：

```powershell
pnpm verify:db-backup
```

备份 Docker 开发数据库：

```powershell
pnpm backup:db:dev
```

如需指定位置：

```powershell
$env:DB_BACKUP_OUTPUT_DIR='D:/Users/DELL/Desktop'
pnpm backup:db
```

这些命令不会执行恢复或修改数据库。恢复必须先在独立测试数据库演练并核对应收、应付、毛利、导入批次和签名证据；不得直接覆盖当前业务库。历史 SQLite 文件如需留档，使用 `pnpm backup:legacy-sqlite`。

## Render 部署

项目包含 `render.yaml`。

构建命令：

```bash
pnpm install --frozen-lockfile
pnpm build:render
```

`pnpm build:render` 只同步数据库结构并构建前后端，不会自动写入演示数据。真实业务数据应通过 Excel 导入写入数据库。

启动命令：

```bash
pnpm start:render
```

建议环境变量：

```env
DATABASE_URL=<PostgreSQL connection string>
VITE_API_BASE_URL=/api
PORT=4000
AUTH_TOKEN_SECRET=<production secret>
```

本地如需演示种子数据，可手动执行：

```powershell
pnpm prisma:seed
```

生产环境默认禁止执行种子数据写入。只有明确做演示库重置时，才可设置 `ALLOW_PRODUCTION_SEED=true` 后执行。

## Docker 部署

本地开发模式：

```powershell
Copy-Item .env.docker.example .env.docker
# 编辑 .env.docker，替换全部 CHANGE_ME
docker compose --env-file .env.docker -f docker-compose.dev.yml up -d --build
```

本地生产模式：

```powershell
Copy-Item .env.production.example .env.production
# 编辑 .env.production，替换全部 CHANGE_ME
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

生产模式由 Nginx 统一提供入口：

- 前端：http://localhost/
- 后端：http://localhost/api
- PostgreSQL 和 Backend 不直接开放到宿主机

完整架构、端口、数据卷和停止/重启说明见 [DOCKER_ARCHITECTURE.md](./DOCKER_ARCHITECTURE.md)。Docker 镜像构建阶段不会连接或修改数据库。

## 目录说明

- `client/`：前端应用
- `server/`：后端 API
- `prisma/`：PostgreSQL 数据模型与迁移文件
- `scripts/verify-all.ts`：构建、导入验收和 UI smoke 总验收脚本
- `scripts/verify-import.ts`：Excel 导入和财务工作流验收脚本
- `start-finance-local.ps1`：Finance 项目本地一键启动脚本
- `agents/finance/`：FP&A Analyst 规则
- `docs/`：业务、API、部署和计算口径文档

## 当前线上地址

- GitHub Pages：https://jiayinz906-lang.github.io/cross-border-finance-mvp/
- Render API：https://cross-border-finance-server.onrender.com/api

## Production trial controls

- Production must use PostgreSQL through `DATABASE_URL`. Render deployment reads the Render PostgreSQL `connectionString`; SQLite is only kept for local backup or historical validation.
- Set `AUTH_REQUIRE_TOKEN=true` and `ALLOW_HEADER_ROLE=false` in production. With this mode enabled, `x-finance-role` is ignored and all protected API calls require a Bearer token.
- Public endpoints are limited to `/api/health`, `/api/auth/login`, and `/api/workflow/signature/:token/sign`.
- Write operations require explicit permissions: Excel import/template/rollback, parameter rules, risk review, confirmation approval, exports, and month close.
- Excel import is a two-step flow: preview first, confirm import second. Preview does not write orders, raw ledger lines, or import batches.
- Month close is blocked until risk review, service confirmation, commission signature/supervisor confirmation, and receivable/payable reconciliation are completed.
- Commission confirmation documents are versioned. Supervisor-confirmed documents are immutable; voiding requires a reason and regeneration creates a new version. Signature tokens are one-time-use and store IP, User-Agent, and signature timestamps.
