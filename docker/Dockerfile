# Stage 1: Build
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim AS builder

RUN npm install -g pnpm@9 --registry=https://registry.npmmirror.com

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/types/package.json packages/types/tsconfig.json packages/types/
COPY packages/database/package.json packages/database/tsconfig.json packages/database/
COPY packages/providers/package.json packages/providers/tsconfig.json packages/providers/
COPY packages/tools/package.json packages/tools/tsconfig.json packages/tools/
COPY packages/skills/package.json packages/skills/tsconfig.json packages/skills/
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
COPY packages/server/package.json packages/server/tsconfig.json packages/server/
COPY packages/web/package.json packages/web/tsconfig.json packages/web/vite.config.ts packages/web/index.html packages/web/

RUN pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com

COPY packages/ packages/
COPY skills/ skills/

RUN pnpm -r build

# Stage 2: Production
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim AS production

RUN npm install -g pnpm@9 --registry=https://registry.npmmirror.com

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/database/package.json packages/database/
COPY packages/providers/package.json packages/providers/
COPY packages/tools/package.json packages/tools/
COPY packages/skills/package.json packages/skills/
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile --prod --registry=https://registry.npmmirror.com

COPY --from=builder /app/packages/types/dist packages/types/dist
COPY --from=builder /app/packages/database/dist packages/database/dist
COPY --from=builder /app/packages/providers/dist packages/providers/dist
COPY --from=builder /app/packages/tools/dist packages/tools/dist
COPY --from=builder /app/packages/skills/dist packages/skills/dist
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/web/dist packages/web/dist
COPY --from=builder /app/skills skills/

RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_TYPE=sqlite
ENV DB_PATH=/app/data/agentforge.db
ENV PORT=3000

CMD ["node", "packages/server/dist/index.js"]
