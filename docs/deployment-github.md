# GitHub deployment

This project is a full-stack app:

- `client/`: Vite static frontend, deployable to GitHub Pages.
- `server/`: Express + Prisma backend, deployable to any Node/Docker web service.

GitHub Pages cannot run the Express backend. Deploy the backend first, then set the frontend variable `VITE_API_BASE_URL` to the public backend API URL, for example:

```text
https://your-backend.example.com/api
```

## Frontend on GitHub Pages

The repository includes `.github/workflows/pages.yml`.

1. Push the repository to GitHub on branch `main`.
2. In GitHub repository settings, enable Pages with source `GitHub Actions`.
3. Add repository variable `VITE_API_BASE_URL` with the backend API URL.
4. Run the workflow `Deploy frontend to GitHub Pages`.

The frontend uses hash routing, so URLs under GitHub Pages work without server-side rewrites.

## Backend deployment

The backend can be deployed with the included `Dockerfile`.

Required environment variables:

```env
DATABASE_URL="file:./dev.db"
PORT=4000
```

For a persistent production deployment, use a persistent disk or migrate `DATABASE_URL` to PostgreSQL. The bundled SQLite setting is suitable for demo and single-user validation.

## Local verification

```powershell
pnpm prisma generate
pnpm exec prisma db push
pnpm --filter cross-border-finance-server build
pnpm --filter cross-border-finance-client build
```

Then run:

```powershell
$env:PORT="4001"
$env:DATABASE_URL="file:./dev.db"
pnpm exec tsx watch server\src\index.ts
```

And in another terminal:

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:4001/api"
pnpm --filter cross-border-finance-client dev -- --host 127.0.0.1 --port 5174
```
