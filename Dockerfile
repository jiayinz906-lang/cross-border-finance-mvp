FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY server/package.json ./server/package.json
COPY server/tsconfig.json ./server/tsconfig.json

RUN cd server && pnpm install

COPY server/src ./server/src

RUN cd server && pnpm exec prisma generate --schema ../prisma/schema.prisma
RUN cd server && pnpm run build
RUN cd server && pnpm exec prisma db push --schema ../prisma/schema.prisma
RUN cd server && pnpm prune --prod

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY prisma ./prisma
COPY server/package.json ./server/package.json
COPY server/tsconfig.json ./server/tsconfig.json
COPY --from=build /app/prisma/dev.db ./prisma/dev.db
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/node_modules ./server/node_modules

EXPOSE 4000

CMD ["sh", "-c", "cd server && node dist/index.js"]
