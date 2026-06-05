FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.5 --activate
WORKDIR /app

# Dependências
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-gateway/package.json apps/api-gateway/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/blockchain-core/package.json packages/blockchain-core/
RUN pnpm install --frozen-lockfile

# Source
COPY tsconfig.json ./
COPY apps/api-gateway/ apps/api-gateway/
COPY packages/ packages/

# Build dependencies first (dist/ must exist for tsconfig.build.json resolution)
RUN pnpm --filter @cryptobingo/shared-types build
RUN pnpm --filter @cryptobingo/blockchain-core build
# Build api-gateway (uses tsconfig.build.json — no paths, resolves via node_modules)
RUN pnpm --filter @cryptobingo/api-gateway build
RUN pnpm --filter @cryptobingo/api-gateway deploy /app/deploy --prod

# Produção
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/deploy ./

EXPOSE 8080
CMD ["node", "dist/index.js"]
