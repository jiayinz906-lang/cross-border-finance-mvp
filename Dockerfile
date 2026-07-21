# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
ENV CI=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY server/package.json server/tsconfig.json ./server/
COPY client/package.json client/tsconfig.json client/vite.config.ts client/index.html ./client/

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate

FROM dependencies AS development

COPY scripts ./scripts
COPY server/src ./server/src
COPY server/assets ./server/assets
COPY client/src ./client/src

CMD ["pnpm", "dev"]

FROM development AS frontend-build

ARG VITE_API_BASE_URL=/api
ARG VITE_PUBLIC_APP_URL=http://localhost/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}

RUN pnpm --filter cross-border-finance-client build

FROM development AS backend-build

RUN pnpm --filter cross-border-finance-server build

FROM nginx:1.27-alpine AS frontend-runtime

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/client/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

FROM node:22-bookworm-slim AS backend-runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV CONFIRMATION_FONT_PATH=/usr/share/fonts/truetype/xjd/SimHei.ttf

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates fontconfig poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY server/package.json ./server/package.json
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/server/node_modules ./server/node_modules
COPY --from=backend-build /app/server/dist ./server/dist
COPY server/assets/SimHei.ttf /usr/share/fonts/truetype/xjd/SimHei.ttf

RUN fc-cache -f \
  && chown -R node:node /app

USER node
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

CMD ["node", "server/dist/index.js"]
