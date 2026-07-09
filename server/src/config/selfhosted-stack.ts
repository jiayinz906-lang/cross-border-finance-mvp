export const selfHostedStack = {
  source: "awesome-selfhosted-master",
  frontend: {
    runtime: "React + Vite static frontend",
    selfHostedPattern: "Static site behind HTTPS reverse proxy or GitHub Pages/Vercel style static hosting",
    currentLocalUrl: "http://localhost:5173/"
  },
  backend: {
    runtime: "Node.js + Express API",
    selfHostedPattern: "Dockerized Node service with health endpoint and persistent environment variables",
    currentLocalUrl: "http://localhost:4000/api"
  },
  database: {
    runtime: "Prisma ORM",
    currentLocal: "SQLite prisma/dev.db",
    productionRecommendation: "PostgreSQL for multi-user production; SQLite only for local/single-user validation"
  },
  deploymentPrinciples: [
    "前端静态资源和后端 API 分离，前端通过 VITE_API_BASE_URL 调用后端。",
    "数据库必须持久化备份；生产环境优先 PostgreSQL。",
    "Excel 导入、模板表头和确认单状态全部由后端写入数据库。",
    "健康检查、构建结果和页面 200 响应作为上线证据。"
  ]
};
