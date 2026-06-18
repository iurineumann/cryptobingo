#!/usr/bin/env bash
# Sobe o ambiente dev local no kind (kubectl + kind).
# Uso: ./infra/scripts/kind-dev.sh [--rebuild] [--reset]
#   --rebuild  força rebuild das imagens Docker antes de carregar
#   --reset    destrói e recria o cluster kind do zero
set -euo pipefail

CLUSTER_NAME="cryptobingo-dev"
KIND_CONFIG="infra/kind/kind-config.yaml"
OVERLAY="infra/k8s/overlays/dev"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$REPO_ROOT"

REBUILD=false
RESET=false
for arg in "$@"; do
  case $arg in
    --rebuild) REBUILD=true ;;
    --reset)   RESET=true   ;;
  esac
done

# ── 1. Cluster kind ───────────────────────────────────────────────
if $RESET && kind get clusters 2>/dev/null | grep -q "$CLUSTER_NAME"; then
  echo "🗑  Destruindo cluster $CLUSTER_NAME..."
  kind delete cluster --name "$CLUSTER_NAME"
fi

if ! kind get clusters 2>/dev/null | grep -q "$CLUSTER_NAME"; then
  echo "🔧 Criando cluster kind: $CLUSTER_NAME"
  kind create cluster --name "$CLUSTER_NAME" --config "$KIND_CONFIG"

  # Ingress nginx para roteamento local
  echo "📦 Instalando ingress-nginx..."
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
  kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=90s
else
  echo "✅ Cluster $CLUSTER_NAME já existe"
fi

# Garante que kubectl usa o contexto correto
kubectl config use-context "kind-$CLUSTER_NAME"

# ── 2. Build das imagens ─────────────────────────────────────────
build_image() {
  local app=$1
  local tag="cryptobingo/${app}:dev"
  if $REBUILD || [[ -z "$(docker images -q "$tag" 2>/dev/null)" ]]; then
    echo "🏗  Buildando $tag..."
    if [[ "$app" == "frontend" ]]; then
      docker build -t "$tag" "apps/$app/" \
        --build-arg VITE_API_GATEWAY_URL="http://localhost:8090/api" \
        --build-arg VITE_WS_URL="http://localhost:8090" \
        --build-arg VITE_RPC_URL="http://host.docker.internal:8888" \
        --build-arg VITE_CHAIN_ID="8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f" \
        --build-arg VITE_CONTRACT_ACCOUNT="bingogamectr"
    else
      docker build -t "$tag" "apps/$app/"
    fi
  else
    echo "⏭  Imagem $tag já existe (use --rebuild para forçar)"
  fi
}

build_image api-gateway
build_image worker-game-loop
build_image frontend

# ── 3. Load no kind ───────────────────────────────────────────────
echo "📤 Carregando imagens no cluster kind..."
kind load docker-image cryptobingo/api-gateway:dev     --name "$CLUSTER_NAME"
kind load docker-image cryptobingo/worker-game-loop:dev --name "$CLUSTER_NAME"
kind load docker-image cryptobingo/frontend:dev        --name "$CLUSTER_NAME"

# ── 4. Apply kustomize dev overlay ───────────────────────────────
echo "🚀 Aplicando overlay dev..."
kubectl apply -k "$OVERLAY"

# ── 5. Status ─────────────────────────────────────────────────────
echo ""
echo "✅ Deploy concluído. Aguardando pods..."
kubectl rollout status deployment/api-gateway     -n cryptobingo --timeout=120s || true
kubectl rollout status deployment/worker-game-loop -n cryptobingo --timeout=120s || true
kubectl rollout status deployment/frontend         -n cryptobingo --timeout=120s || true

echo ""
echo "📊 Estado dos pods:"
kubectl get pods -n cryptobingo
echo ""
echo "🌐 Acesso local: http://localhost:8090 (frontend + api via ingress)"
echo "   ATENÇÃO: nodeos WAX deve estar rodando em localhost:8888 no host"
