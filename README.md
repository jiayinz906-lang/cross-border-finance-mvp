# XJD Finance UI

跨境物流 / 注册服务月度财务分析系统，用于把 Excel 原始台账导入数据库，并生成经营总览、业务利润、物流提成、注册确认、电子签名确认、操作员绩效、客户利润分析、风险复查、上游应付和参数规则。

## 当前能力

- Excel 自动表头映射、导入预检、确认写入数据库。
- 导入批次记录、旧批次替换、当前批次回滚。
- 原始表格汇率口径：人民币为 1，美金/美元/USD/汇率未出按 6.85，其余按表格标注。
- 物流和注册/证书/店铺租赁等服务类业务分开核算。
- 参数规则存入数据库，可在设置页维护。
- 轻量角色权限：系统管理员、财务、主管、老板/管理层、销售/客服。
- 员工确认单电子签名证据链：token 过期时间、IP、User-Agent、角色、签收时间、主管确认记录。
- 一键验收脚本覆盖导入、汇总一致性、RBAC 和签名证据链。

## 技术栈

- 前端：React、TypeScript、Vite、Ant Design、React Router、Axios
- 后端：Node.js、Express、TypeScript、Prisma ORM
- 数据库：SQLite 本地验证；生产多人使用建议迁移 PostgreSQL
- 部署：Render / Docker / GitHub Pages 或 Vercel 前端静态部署

## 本地运行

```powershell
cd D:\Users\DELL\Documents\财务系统\cross-border-finance-mvp
pnpm install
pnpm prisma:deploy
pnpm dev
```

默认地址：

- 前端：http://localhost:5173/
- 后端：http://localhost:4000/api
- 健康检查：http://localhost:4000/api/health
- 就绪检查：http://localhost:4000/api/health/ready?month=2026-06

## 验收测试

默认读取桌面文件 `2026.6月系统运单明细.xlsx`。也可以用 `IMPORT_VERIFY_FILE` 指定其他 Excel。
执行完整验收前，请保持 `pnpm dev` 启动的前后端服务正在运行。

```powershell
pnpm verify:all
```

如只想单独验证某一段，也可以运行：

```powershell
pnpm verify:import
pnpm verify:ui
```

验收内容：

- Excel 文件存在
- 预检识别月份、行数、票数、物流/服务拆分
- 字段映射无必填缺失
- 参数规则被导入计算读取
- 正式导入生成批次
- 订单、提成、风险、服务确认落库
- 月度汇总与单票明细合计一致
- RBAC 权限规则正确
- 确认单生成、签名 token、员工签收、主管确认和签名证据落库
- 前端页面、后端健康、数据库就绪、表头模板和仪表盘汇总可用

## 常用命令

```powershell
pnpm --filter cross-border-finance-server build
pnpm --filter cross-border-finance-client build
pnpm verify:all
pnpm verify:import
pnpm verify:ui
pnpm prisma:deploy
```

## Render 部署

项目包含 `render.yaml`。Render 构建时执行：

```bash
pnpm install --frozen-lockfile
pnpm build:render
```

启动命令：

```bash
pnpm start:render
```

Render 环境变量：

```env
DATABASE_URL=file:./dev.db
VITE_API_BASE_URL=/api
PORT=4000
```

注意：Render 免费实例文件系统不适合作为长期财务生产数据库。正式多人使用建议使用 PostgreSQL，并把 `DATABASE_URL` 改为 PostgreSQL 连接串。

## Docker 部署

```powershell
docker build -t xjd-finance-ui .
docker run --rm -p 4000:4000 xjd-finance-ui
```

容器访问：

- 前端：http://localhost:4000/
- 后端：http://localhost:4000/api

## 目录说明

- `client/`：前端应用
- `server/`：后端 API
- `prisma/`：数据库模型和种子数据
- `scripts/verify-all.ts`：构建、导入验收和 UI 冒烟总验收脚本
- `scripts/verify-import.ts`：Excel 导入和财务工作流验收脚本
- `agents/finance/`：FP&A Analyst 规则
- `docs/`：业务、API、部署和计算口径文档

## 当前线上地址

- GitHub Pages：https://jiayinz906-lang.github.io/cross-border-finance-mvp/
- Render API：https://cross-border-finance-server.onrender.com/api
