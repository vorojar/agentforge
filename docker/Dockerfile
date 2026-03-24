# Stage 1: Build
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

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

RUN pnpm install --frozen-lockfile

COPY packages/ packages/

RUN pnpm -r build

# Stage 2: Production
FROM node:20-slim AS production

RUN corepack enable && corepack prepare pnpm@9 --activate

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

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/types/dist packages/types/dist
COPY --from=builder /app/packages/database/dist packages/database/dist
COPY --from=builder /app/packages/providers/dist packages/providers/dist
COPY --from=builder /app/packages/tools/dist packages/tools/dist
COPY --from=builder /app/packages/skills/dist packages/skills/dist
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/web/dist packages/web/dist

RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV DATABASE_TYPE=sqlite
ENV DATABASE_URL=/app/data/agentforge.db
ENV PORT=3000

CMD ["node", "packages/server/dist/index.js"]
