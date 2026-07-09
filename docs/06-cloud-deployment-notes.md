# 云端部署预留说明

## 配置原则

1. 业务代码中不硬编码 localhost。
2. 后端端口使用 `PORT`。
3. 前端 API 地址使用 `VITE_API_BASE_URL`。
4. 数据库地址使用 `DATABASE_URL`。
5. 前端可部署到 GitHub Pages、Vercel、Netlify、Render Static Site 或 Nginx。
6. 后端可部署到 Render、Railway、Fly.io、Docker 或云服务器。
7. 本地 SQLite 适合开发和单人验证。
8. 生产多人使用建议迁移 PostgreSQL。
9. Prisma 保持 ORM 访问方式，后续迁移数据库不需要重写业务层。
10. 汇率不接外部 API，严格按原始 Excel 标注执行：人民币按 1，美金 / 美元 / USD / 汇率未出按 6.85，其余数字汇率按标注数据。
11. `/api/health` 用于云平台健康检查。
12. `/api/health/ready?month=2026-06` 用于确认数据库、参数规则、表头模板和财务汇总是否就绪。

## 本地标准端口

- 前端：http://localhost:5173/
- 后端：http://localhost:4000/api

## Render 建议

Render 免费实例的文件系统不适合作为长期财务生产数据库。正式上线建议使用 Render PostgreSQL 或外部 PostgreSQL。

Render 构建命令不要自动执行 `pnpm prisma:seed`。构建阶段只同步数据库结构和构建前后端，真实业务数据通过 Excel 导入写入数据库。

建议环境变量：

```env
DATABASE_URL=<PostgreSQL connection string>
VITE_API_BASE_URL=/api
PORT=4000
AUTH_TOKEN_SECRET=<production secret>
```

## 上线前检查

```powershell
pnpm doctor
pnpm verify:all
```

上线后至少检查：

- 首页或仪表盘可打开。
- `/api/health` 返回 `status: ok`。
- `/api/health/ready?month=2026-06` 返回 `status: ready`。
- Excel 导入模板存在。
- 最新导入批次存在。
- 仪表盘应收、应付、毛利有数。
