# 云端部署预留说明

1. 不在业务代码中硬编码 localhost。
2. 后端端口使用 `PORT`。
3. 前端接口地址使用 `VITE_API_BASE_URL`。
4. 数据库地址使用 `DATABASE_URL`。
5. 前端后续可部署到 Vercel / Netlify。
6. 后端后续可部署到 Render / Railway / Fly.io / 云服务器。
7. 本地 SQLite 适合开发和单人验证。
8. 生产环境多人使用建议迁移 PostgreSQL。
9. Prisma 可帮助后续迁移数据库，并保持 ORM 访问方式。
10. ExchangeRate-API Key 应配置在云端环境变量中，不写入代码或 README。
11. `/api/health` 用于云平台健康检查。
