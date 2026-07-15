#!/usr/bin/env bash
# deploy-landing.sh — Build + deploy MANUAL do landing-page (blog) para Azure Static Web Apps
# Uso: bash scripts/deploy-landing.sh
#
# Pré-requisitos:
#   - swa CLI (npm install -g @azure/static-web-apps-cli)
#   - Azure CLI logado com acesso ao SWA
#   - Token de deploy (SWA_DEPLOY_TOKEN_LANDING)
#
# PRECEITO (2026-07-14): GitHub Actions BLOQUEADAS em free tier -> deploy SEMPRE manual.
# O workflow .github/workflows/deploy-landing.yml NAO roda. Este script é o gate real.
#
# PONTO CRÍTICO: o landing-page depende do submodule content/ (cryptobingo-tina.git),
# com slugs.json (slugs dinamicos ADR-040). Sem o submodule, o build FALHA:
#   "Invalid route exports found when prerendering with ssr:false"
# Por isso o passo 1 (git submodule update --init) é OBRIGATÓRIO antes do build.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LANDING_DIR="$ROOT_DIR/apps/landing-page"
BUILD_DIR="$LANDING_DIR/build/client"
CONTENT_DIR="$LANDING_DIR/content"
APP_NAME="${SWA_LANDING_APP_NAME:-cryptobingo-landing}"
ENV="production"

echo "=== Deploy Landing Page (manual) ==="

# 1. Submodule content/ OBRIGATÓRIO (sem ele o build quebra)
echo ""
echo "=== Inicializando submodule content/ (obrigatório) ==="
git submodule update --init --recursive
if [ ! -f "$CONTENT_DIR/slugs.json" ]; then
    echo "❌ content/slugs.json ausente após submodule update."
    echo "   Verifique .gitmodules e acesso ao repo cryptobingo-tina.git."
    exit 1
fi
echo "✅ submodule content/ presente (slugs.json OK)"

# 2. Build (SSG: ssr:false + prerender — requer slugs.json p/ listar rotas no prerender)
echo ""
echo "=== Buildando landing-page (SSG) ==="
cd "$LANDING_DIR"
# VITE_API_URL é resolvido em BUILD TIME (api.ts: API_BASE = VITE_API_URL ?? '/api').
# A ADR-039 previa que o GitHub Actions setava essa env; como o Actions está
# DESLIGADO (free tier), o deploy MANUAL deve garanti-la. O apps/landing-page/.env
# tem o valor mas é gitignored → num clone limpo o build cairia no fallback '/api'
# e o frontend chamaria o SWA (sem backend) → 500. Força sempre a API correta.
export VITE_API_URL="${VITE_API_URL:-https://landing-api.cryptobingo.bet/api}"
echo "VITE_API_URL=$VITE_API_URL"
pnpm build
echo "✅ Build concluído"

# 3. Token de deploy
echo ""
echo "=== Obtendo token de deploy ==="
if [ -z "${SWA_DEPLOY_TOKEN_LANDING:-}" ]; then
    echo "⚠️  SWA_DEPLOY_TOKEN_LANDING não definido. Obtendo do Azure CLI..."
    TOKEN=$(az staticwebapp secrets list --name "$APP_NAME" \
        --resource-group cryptobingo-testnet \
        --query "properties.apiKey" -o tsv 2>/dev/null)
    if [ -z "$TOKEN" ]; then
        echo "❌ Não foi possível obter token. Exporte SWA_DEPLOY_TOKEN_LANDING manualmente."
        exit 1
    fi
    export SWA_DEPLOY_TOKEN_LANDING="$TOKEN"
fi

# 4. Deploy (skip_app_build: o build já foi feito no passo 2)
echo ""
echo "Deployando $BUILD_DIR → $APP_NAME ($ENV)..."
swa deploy "$BUILD_DIR" \
    --deployment-token "$SWA_DEPLOY_TOKEN_LANDING" \
    --app-name "$APP_NAME" \
    --env "$ENV" \
    --swa-config-location "$LANDING_DIR"

echo ""
echo "=== ✅ Deploy concluído! ==="
echo "   Site: https://cryptobingo.bet (ou test.cryptobingo.bet)"
echo ""
echo "=== Pós-deploy: verificação manual ==="
echo "   1. Abrir https://cryptobingo.bet/blog e uma postagem individual"
echo "   2. F12 → Network — o HTML deve vir pré-renderizado (não SPA fallback)"
echo "   3. Validar via scripts/validate-vps-health.sh (rotas da landing-api)"
