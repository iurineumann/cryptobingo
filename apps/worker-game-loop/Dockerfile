FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.5 --activate
WORKDIR /app

# Dependências
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker-game-loop/package.json apps/worker-game-loop/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/blockchain-core/package.json packages/blockchain-core/
RUN pnpm install --frozen-lockfile

# Source
COPY tsconfig.json ./
COPY apps/worker-game-loop/ apps/worker-game-loop/
COPY packages/ packages/

# Build
RUN pnpm --filter @cryptobingo/worker-game-loop build
RUN pnpm --filter @cryptobingo/worker-game-loop deploy /app/deploy --prod

# Produção
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/deploy ./

EXPOSE 8085 9091
CMD ["node", "dist/index.js"]
