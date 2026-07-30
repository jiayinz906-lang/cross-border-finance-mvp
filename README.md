# XJD Finance UI

## 生产能力概览（2026-07）

- 新增“财务工作台”：统一处理待办任务、客户/供应商主数据、应收应付账单和银行流水对账。
- 账单由当前月份已确认的 ERP 手工业务单自动同步；原始费用明细仍逐行写入 `RawLedgerLine` / `FinanceChargeLine`，作为唯一财务追溯来源。
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

跨境物流 / 注册服务月度财务分析系统。日常数据通过 ERP 式业务单手工录入并确认入账，随后生成经营总览、业务利润、物流提成、注册确认、电子签名确认、操作员绩效、客户利润分析、风险复查、上游应付、参数规则和原始数据追溯。历史 Excel 导入仅保留为旧数据迁移与兼容工具。

## 当前能力

- ERP 式业务单由“单据头 + 多条费用明细 + 图片凭证”组成，支持保存草稿、确认入账、查看详情和填写原因后作废。
- 手工字段覆盖 23 列固定表头规范；一张业务单可同时录入应收、应付及不同费用类型，金额正负号、币种和汇率按录入值保留。
- 确认业务单后，后端统一生成 `RawLedgerLine`、`FinanceChargeLine`、订单、月度汇总、风险、提成和服务确认数据；所有金额可追溯到业务单费用行。
- 图片凭证直接持久化到 PostgreSQL，并保留创建、确认、作废和月度重算审计日志。
- 历史 Excel 自动表头映射、预检和确认导入能力继续保留，但不再作为日常主入口。
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
- 业务数据录入：http://localhost:5173/#/raw-entry
- 后端 API：http://localhost:4000/api
- 健康检查：http://localhost:4000/api/health
- 就绪检查：http://localhost:4000/api/health/ready
- 运维状态（登录后）：http://localhost:4000/api/health/status

## 首次安装或数据库同步

```powershell
pnpm install
pnpm prisma:deploy
```

## 业务数据录入与字段规范

当前后台模板 Key：

```text
system_waybill_detail
```

手工业务单字段规范来自 `表头模版.xlsx`，共 23 列：

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

日常录入流程：

1. 进入“业务数据录入”，新增业务单。
2. 填写月份、业务日期、运单号、客户、服务、销售代表、客服代表等单据头信息。
3. 在费用明细中逐行选择应收/应付、费用类型、往来单位、原币金额、币种和汇率；一张业务单可包含多条费用。
4. 可先保存草稿；核对无误后确认入账。确认后系统自动重算该月份的应收、应付、毛利、风险和提成。
5. 已确认业务单需要调整时，填写作废原因后作废，系统会自动按当前有效业务单重算该月份。

后台表头模板只保存字段规范，不保存业务数据。历史 Excel 导入继续按这份模板做字段映射、缺失表头校验和模板差异记录，供旧数据迁移或审计使用。

## 验收测试

完整验收前，请保持 `pnpm dev` 或 `.\start-finance-local.ps1` 启动的前后端服务正在运行。

兼容回归测试默认读取桌面文件 `2026.6月系统运单明细.xlsx`。也可以用 `IMPORT_VERIFY_FILE` 指定其他 Excel：

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

`pnpm build:render` 只同步数据库结构并构建前后端，不会自动写入演示数据。真实业务数据应在“业务数据录入”中按业务单手工填写并确认入账。

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

生产环境永久禁止执行种子数据写入；演示数据只能在隔离的本地测试数据库中生成。

## 腾讯云生产化准备

仓库新增独立的 `docker-compose.tencent.yml`，不会改变现有 GitHub Pages、Render 或本地 Docker 入口。腾讯云环境只允许 Nginx 暴露 80/443，Backend 与 PostgreSQL 仅通过 Docker 网络访问；数据库目录固定挂载到 Git 仓库外的 `/data/xjd-finance/postgres`。普通容器启动不会自动执行 migration，数据库变更只能在备份和维护模式后显式运行。

正式迁移前请依次审阅：

- [腾讯云部署手册](docs/TENCENT_CLOUD_DEPLOYMENT.md)
- [数据库迁移 Runbook](docs/TENCENT_DATABASE_MIGRATION.md)
- [腾讯云迁移安全审核](docs/TENCENT_MIGRATION_SECURITY_AUDIT.md)
- [腾讯云迁移变更审核清单与最小权限矩阵](docs/TENCENT_MIGRATION_REVIEW_CHECKLIST.md)
- [腾讯云数据库迁移本地演练记录](docs/TENCENT_MIGRATION_LOCAL_REHEARSAL.md)
- [备份与恢复](docs/DATABASE_BACKUP_RESTORE.md)
- [发布与回滚](docs/PRODUCTION_RELEASE_ROLLBACK.md)
- [生产安全清单](docs/PRODUCTION_SECURITY_CHECKLIST.md)

本轮仅完成代码、配置、脚本和本地演练准备，不连接 Render 正式库，也不执行真实腾讯云迁移。

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
- `scripts/verify-all.ts`：构建、历史兼容导入验收和 UI smoke 总验收脚本
- `scripts/verify-import.ts`：历史 Excel 兼容导入和财务工作流回归脚本
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
- Write operations require explicit permissions: business document create/confirm/void, legacy Excel import/template/rollback, parameter rules, risk review, confirmation approval, exports, and month close.
- Manual ERP documents are the primary data-entry flow. Legacy Excel import remains a two-step compatibility flow: preview first, confirm import second.
- Month close reports unfinished risk review, service confirmation, signatures, and reconciliation as warnings and records them in the audit log; an authorized supervisor may still close the month with a reason.
- Commission confirmation documents are versioned. Supervisor-confirmed documents are immutable; voiding requires a reason and regeneration creates a new version. Signature tokens are one-time-use and store IP, User-Agent, and signature timestamps.
