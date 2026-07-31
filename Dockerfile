# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS dependencies

WORKDIR /app
ENV CI=true
ARG DEBIAN_MIRROR=http://mirrors.cloud.tencent.com
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN sed -i -E "s#https?://deb.debian.org#${DEBIAN_MIRROR}#g; s#https?://security.debian.org#${DEBIAN_MIRROR}#g" /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null || true
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
  timeout 120s apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 update \
  && timeout 120s apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 install -y --no-install-recommends openssl ca-certificates \
  && timeout 120s npm install --global pnpm@11.9.0 --registry="${NPM_REGISTRY}" --fetch-retries=2 --fetch-timeout=60000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY server/package.json server/tsconfig.json ./server/
COPY client/package.json client/tsconfig.json client/vite.config.ts client/index.html ./client/

RUN --mount=type=cache,id=xjd-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm config set registry "${NPM_REGISTRY}" \
  && pnpm config set store-dir /pnpm/store \
  && pnpm config set fetch-retries 2 \
  && pnpm config set fetch-timeout 60000 \
  && timeout 600s pnpm install --frozen-lockfile
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
ARG BUILD_GIT_SHA=local
ARG BUILD_TIME=unknown
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}
ENV VITE_BUILD_GIT_SHA=${BUILD_GIT_SHA}
ENV VITE_BUILD_TIME=${BUILD_TIME}

RUN pnpm --filter cross-border-finance-client build

FROM development AS backend-build

RUN pnpm --filter cross-border-finance-server build

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS frontend-runtime

ARG BUILD_GIT_SHA=local
ARG BUILD_TIME=unknown
LABEL org.opencontainers.image.revision=${BUILD_GIT_SHA}
LABEL org.opencontainers.image.created=${BUILD_TIME}

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/client/dist /usr/share/nginx/html
RUN printf '{"frontendCommit":"%s","buildTime":"%s"}\n' "${BUILD_GIT_SHA}" "${BUILD_TIME}" > /usr/share/nginx/html/version.json

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS backend-runtime

WORKDIR /app
ARG BUILD_GIT_SHA=local
ARG BUILD_TIME=unknown
ARG DEBIAN_MIRROR=http://mirrors.cloud.tencent.com
ENV NODE_ENV=production
ENV PORT=4000
ENV BUILD_GIT_SHA=${BUILD_GIT_SHA}
ENV FRONTEND_GIT_SHA=${BUILD_GIT_SHA}
ENV BUILD_TIME=${BUILD_TIME}
ENV CONFIRMATION_FONT_PATH=/usr/share/fonts/truetype/xjd/SimHei.ttf
LABEL org.opencontainers.image.revision=${BUILD_GIT_SHA}
LABEL org.opencontainers.image.created=${BUILD_TIME}

RUN sed -i -E "s#https?://deb.debian.org#${DEBIAN_MIRROR}#g; s#https?://security.debian.org#${DEBIAN_MIRROR}#g" /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null || true
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
  timeout 120s apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 update \
  && timeout 120s apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 install -y --no-install-recommends openssl ca-certificates fontconfig poppler-utils

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
