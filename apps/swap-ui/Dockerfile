FROM node:20-alpine AS base
ARG VITE_WAX_RPC_URL
ARG VITE_API_GATEWAY_URL
ARG VITE_GAME_URL
ARG VITE_CHAIN_ID
ARG VITE_SWAP_CONTRACT
RUN corepack enable && corepack prepare pnpm@8.15.5 --activate
WORKDIR /app

# Dependências
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/swap-ui/package.json apps/swap-ui/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/blockchain-core/package.json packages/blockchain-core/
RUN pnpm install --frozen-lockfile

# Source
COPY tsconfig.json ./
COPY apps/swap-ui/ apps/swap-ui/
COPY packages/ packages/

# Build
RUN VITE_WAX_RPC_URL=$VITE_WAX_RPC_URL \
    VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL \
    VITE_GAME_URL=$VITE_GAME_URL \
    VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_SWAP_CONTRACT=$VITE_SWAP_CONTRACT \
    pnpm --filter @cryptobingo/swap-ui build

# Produção (nginx para SPA)
FROM nginx:alpine
COPY --from=base /app/apps/swap-ui/dist /usr/share/nginx/html
COPY apps/swap-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
