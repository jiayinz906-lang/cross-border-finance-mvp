# GitHub Pages / Vercel 前端部署说明

本项目是前后端分离系统：

- `client/`：Vite 静态前端，可部署到 GitHub Pages、Vercel、Netlify 或 Render Static Site。
- `server/`：Express + Prisma 后端，必须部署到 Render、Railway、Fly.io、云服务器或 Docker 容器。

GitHub Pages 只能托管静态前端，不能运行 Express 后端。正确顺序是先部署后端，再把前端的 `VITE_API_BASE_URL` 指向后端 API。

## 前端部署到 GitHub Pages

仓库已包含 `.github/workflows/pages.yml`。

1. 把代码推送到 GitHub 的 `main` 分支。
2. 在 GitHub 仓库 Settings 中启用 Pages，Source 选择 `GitHub Actions`。
3. 在仓库 Variables 中增加：

```text
VITE_API_BASE_URL=https://your-backend.example.com/api
```

4. 运行 `Deploy frontend to GitHub Pages` 工作流。

前端使用 Hash Router，所以 `/#/dashboard` 这类页面在 GitHub Pages 下可以直接刷新。

## 前端部署到 Vercel

推荐把 Vercel 作为前端静态托管：

- Framework：Vite
- Root Directory：`client`
- Build Command：`pnpm build`
- Output Directory：`dist`
- Environment Variable：`VITE_API_BASE_URL=https://your-backend.example.com/api`

## 后端部署

后端可以使用本项目的 `Dockerfile` 或 `render.yaml`。

生产环境建议：

```env
DATABASE_URL=<PostgreSQL connection string>
PORT=4000
AUTH_TOKEN_SECRET=<production secret>
```

SQLite 只适合本地验证、演示或单人短期测试。正式多人使用必须使用 PostgreSQL，并做好数据库备份。

## 本地验证

本地固定端口：

- 前端：http://localhost:5173/
- 后端：http://localhost:4000/api

一键启动：

```powershell
cd D:\Users\DELL\Documents\财务系统\cross-border-finance-mvp
.\start-finance-local.ps1
```

非破坏性体检：

```powershell
pnpm doctor
```

完整验收：

```powershell
$env:IMPORT_VERIFY_FILE='D:/Users/DELL/Desktop/2026.6月系统运单明细.xlsx'
pnpm verify:all
```
