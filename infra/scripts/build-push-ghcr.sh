#!/usr/bin/env bash
# Build e push das imagens para GHCR (testnet/staging).
# Uso: TAG=testnet ./infra/scripts/build-push-ghcr.sh
#
# Requer: docker login ghcr.io -u <github-user> -p <github-token>
set -euo pipefail

REPO="ghcr.io/iurineumann"
TAG="${TAG:-testnet}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

VITE_API_GATEWAY_URL="${VITE_API_GATEWAY_URL:-https://SUBSTITUIR.vcluster.cloud/api}"
VITE_WS_URL="${VITE_WS_URL:-https://SUBSTITUIR.vcluster.cloud}"
VITE_RPC_URL="${VITE_RPC_URL:-https://testnet.waxsweden.org}"
VITE_CHAIN_ID="${VITE_CHAIN_ID:-f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12}"
VITE_CONTRACT_ACCOUNT="${VITE_CONTRACT_ACCOUNT:-bingogamectr}"

echo "🏗  Buildando imagens com tag: $TAG"

docker build -t "${REPO}/cryptobingo-api-gateway:${TAG}" apps/api-gateway/
docker build -t "${REPO}/cryptobingo-worker-game-loop:${TAG}" apps/worker-game-loop/
docker build -t "${REPO}/cryptobingo-frontend:${TAG}" apps/frontend/ \
  --build-arg "VITE_API_GATEWAY_URL=${VITE_API_GATEWAY_URL}" \
  --build-arg "VITE_WS_URL=${VITE_WS_URL}" \
  --build-arg "VITE_RPC_URL=${VITE_RPC_URL}" \
  --build-arg "VITE_CHAIN_ID=${VITE_CHAIN_ID}" \
  --build-arg "VITE_CONTRACT_ACCOUNT=${VITE_CONTRACT_ACCOUNT}"

echo "📤 Pushando para GHCR..."
docker push "${REPO}/cryptobingo-api-gateway:${TAG}"
docker push "${REPO}/cryptobingo-worker-game-loop:${TAG}"
docker push "${REPO}/cryptobingo-frontend:${TAG}"

echo ""
echo "✅ Imagens disponíveis:"
echo "   ${REPO}/cryptobingo-api-gateway:${TAG}"
echo "   ${REPO}/cryptobingo-worker-game-loop:${TAG}"
echo "   ${REPO}/cryptobingo-frontend:${TAG}"
