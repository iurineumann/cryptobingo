FROM node:22-alpine AS base

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/escrow-service/package.json ./apps/escrow-service/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/blockchain-core/package.json ./packages/blockchain-core/

RUN corepack enable && pnpm install --frozen-lockfile --filter "@cryptobingo/escrow-service..."

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --filter "@cryptobingo/escrow-service" run build

FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/apps/escrow-service/dist ./dist
COPY --from=deps /app/node_modules ./node_modules

CMD ["node", "dist/index.js"]
