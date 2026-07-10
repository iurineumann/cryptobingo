# Dockerfile — CryptoBingo ORNG Oracle Daemon
# Imagem mínima: Node 20, compila TS -> JS no build e roda com `node` (sem ts-node em runtime).
# Padrão do repo: contexto = raiz do monorepo (build-push.yml usa context: .).
# Copia o script de scripts/ (fonte de verdade) — não duplica código.

FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# deps isoladas do daemon (não participa do pnpm workspace)
COPY apps/oracle-daemon/package.json ./
RUN npm install --omit=dev=false \
 && chown -R node:node /app

# script fonte (do repo) + tsconfig de build
COPY scripts/orng-oracle.ts ./orng-oracle.ts
COPY apps/oracle-daemon/tsconfig.build.json ./tsconfig.json
RUN chown node:node /app/orng-oracle.ts

# compila TS -> dist/
RUN npx tsc -p tsconfig.json \
 && chown -R node:node /app/dist

# RSA key é montada via volume/secret (ORNG_RSA_PRIVATE_KEY env), não bakeada
ENV ORNG_RSA_PRIVATE_KEY_PATH=/app/rsa/dev-rsa-private.pem

# não root: a imagem node:slim já tem o usuário 'node' (UID 1000)
USER node

CMD ["node", "dist/orng-oracle.js"]
