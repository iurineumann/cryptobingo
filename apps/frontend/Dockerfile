FROM node:20-alpine AS base
ARG VITE_RPC_URL
ARG VITE_API_GATEWAY_URL
ARG VITE_WS_URL
ARG VITE_CHAIN_ID
ARG VITE_CONTRACT_ACCOUNT
RUN corepack enable && corepack prepare pnpm@8.15.5 --activate
WORKDIR /app

# Dependências
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/blockchain-core/package.json packages/blockchain-core/
RUN pnpm install --frozen-lockfile

# Source
COPY tsconfig.json ./
COPY apps/frontend/ apps/frontend/
COPY packages/ packages/

# Build
RUN VITE_RPC_URL=$VITE_RPC_URL \
    VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_CONTRACT_ACCOUNT=$VITE_CONTRACT_ACCOUNT \
    pnpm --filter @cryptobingo/frontend build

# Produção (nginx para SPA)
FROM nginx:alpine
COPY --from=base /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
