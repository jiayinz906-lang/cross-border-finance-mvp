FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV DATABASE_URL=file:./dev.db
ENV VITE_API_BASE_URL=/api

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates fontconfig poppler-utils \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY server/package.json server/tsconfig.json ./server/
COPY client/package.json client/tsconfig.json client/vite.config.ts client/index.html ./client/

RUN pnpm install --frozen-lockfile

COPY server/src ./server/src
COPY client/src ./client/src

RUN pnpm prisma:deploy
RUN pnpm --filter cross-border-finance-client build
RUN pnpm --filter cross-border-finance-server build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL=file:./dev.db

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates fontconfig poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/prisma/dev.db ./prisma/dev.db
COPY server/assets/SimHei.ttf /usr/share/fonts/truetype/xjd/SimHei.ttf
RUN fc-cache -f

EXPOSE 4000

CMD ["node", "server/dist/index.js"]
