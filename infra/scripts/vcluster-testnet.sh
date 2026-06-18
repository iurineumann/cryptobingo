#!/usr/bin/env bash
# Deploy do ambiente testnet no vcluster.cloud.
# Pré-requisitos:
#   1. vcluster CLI instalado: https://www.vcluster.com/docs/getting-started/setup
#   2. kubectl configurado com acesso ao vcluster.cloud
#   3. Imagens publishadas no GHCR (ver build-push-ghcr.sh)
#   4. CLUSTER_HOST preenchido com o hostname real do seu cluster vcluster.cloud
#
# Uso: CLUSTER_HOST=<seu-cluster>.vcluster.cloud ./infra/scripts/vcluster-testnet.sh
set -euo pipefail

OVERLAY="infra/k8s/overlays/testnet"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

CLUSTER_HOST="${CLUSTER_HOST:-}"
if [[ -z "$CLUSTER_HOST" ]]; then
  echo "❌ CLUSTER_HOST não definido."
  echo "   Exemplo: CLUSTER_HOST=cryptobingo.abc123.vcluster.cloud ./infra/scripts/vcluster-testnet.sh"
  exit 1
fi

# Substitui placeholder no ingress e configmap pelo host real
sed -i "s/cryptobingo.SUBSTITUIR.vcluster.cloud/${CLUSTER_HOST}/g" \
  "$OVERLAY/ingress-patch.yaml" \
  "$OVERLAY/kustomization.yaml"

echo "🚀 Aplicando overlay testnet (host: $CLUSTER_HOST)..."
kubectl apply -k "$OVERLAY"

echo ""
echo "⏳ Aguardando databases ficarem prontos..."
kubectl rollout status deployment/postgres  -n cryptobingo --timeout=120s
kubectl rollout status deployment/mongodb   -n cryptobingo --timeout=120s
kubectl rollout status deployment/redis     -n cryptobingo --timeout=120s
kubectl rollout status deployment/rabbitmq  -n cryptobingo --timeout=120s

echo ""
echo "⏳ Aguardando apps..."
kubectl rollout status deployment/api-gateway      -n cryptobingo --timeout=180s
kubectl rollout status deployment/worker-game-loop -n cryptobingo --timeout=180s
kubectl rollout status deployment/frontend         -n cryptobingo --timeout=180s

echo ""
echo "📊 Estado dos pods:"
kubectl get pods -n cryptobingo

echo ""
echo "✅ Deploy testnet concluído."
echo "   Frontend: https://${CLUSTER_HOST}"
echo "   API:      https://${CLUSTER_HOST}/api"
echo ""
echo "   ⚠️  Ainda precisa:"
echo "   1. kubectl create secret generic cryptobingo-secrets -n cryptobingo \\"
echo "        --from-literal=JWT_SECRET=<valor> \\"
echo "        --from-literal=MICROSERVICE_PRIVATE_KEY=<chave-testnet> \\"
echo "        --from-literal=POSTGRES_PASSWORD=<senha> \\"
echo "        --from-literal=MONGO_PASSWORD=<senha> \\"
echo "        --from-literal=RABBITMQ_PASSWORD=<senha>"
echo "   2. MONGO_URL/POSTGRES_URL/REDIS_URL/RABBITMQ_URL no secret cryptobingo-db-urls"
echo "      (apontam para *-svc dentro do cluster, já corretos)"
