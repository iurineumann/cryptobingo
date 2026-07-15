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
# PONTO CRÍTICO 1: o landing-page depende do submodule content/ (cryptobingo-tina.git),
# com slugs.json (slugs dinamicos ADR-040). Sem o submodule, o build FALHA:
#   "Invalid route exports found when prerendering with ssr:false"
# Por isso o passo 1 (git submodule update --init) é OBRIGATÓRIO antes do build.
#
# PONTO CRÍTICO 2 (2026-07-15): BUILD EM WORKTREE LIMPO em /tmp.
# O working tree principal fica sujo com artifacts .js/.js.map emitidos pelo
# `tsc` (roller do react-router/rolldown varre src/ e processa esses .js stale
# -> PARSE_ERROR de JSX e build quebrado). Isso é um bug recorrente (RAG:
# tech-debt/2026-07-14-landing-slugs-guard-sitemap item 7). A solução
# documentada é NUNCA buildar no working tree principal: criamos um worktree
# limpo em /tmp, fazemos o build lá e deployamos. O worktree é removido
# ao final. Assim o build do landing (que inclui a task corrente) sempre
# passa, independente de sujeira no repo principal.
#
# PONTO CRÍTICO 3: VITE_API_URL é resolvido em BUILD TIME (api.ts:
# API_BASE = VITE_API_URL ?? '/api'). O apps/landing-page/.env tem o valor
# mas é gitignored -> num clone limpo o build cairia no fallback '/api' e o
# frontend chamaria o SWA (sem backend) -> 500. Força sempre a API correta.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LANDING_DIR="$ROOT_DIR/apps/landing-page"
CONTENT_DIR="$LANDING_DIR/content"
APP_NAME="${SWA_LANDING_APP_NAME:-cryptobingo-landing}"
ENV="production"

# Worktree limpo em /tmp (evita artifacts .js stale do tsc sujarem o rolldown)
WT="/tmp/cb-landing-build-$(date +%s)"
BRANCH="deploy-landing-$(date +%s)"

echo "=== Deploy Landing Page (manual, worktree limpo) ==="
echo "Worktree: $WT"

# 0. Worktree limpo a partir de origin/develop (ja tem a task corrente mergeada)
echo ""
echo "=== Criando worktree limpo em $WT ==="
git fetch origin develop 2>/dev/null || true
git worktree add -b "$BRANCH" "$WT" origin/develop 2>&1 | tail -2
WT_LANDING="$WT/apps/landing-page"
WT_CONTENT="$WT_LANDING/content"

# 1. Submodule content/ OBRIGATÓRIO (sem ele o build quebra)
echo ""
echo "=== Inicializando submodule content/ (obrigatório) ==="
git -C "$WT" submodule update --init --recursive
if [ ! -f "$WT_CONTENT/slugs.json" ]; then
    echo "❌ content/slugs.json ausente após submodule update."
    echo "   Verifique .gitmodules e acesso ao repo cryptobingo-tina.git."
    git worktree remove "$WT" --force 2>/dev/null || true
    exit 1
fi
echo "✅ submodule content/ presente (slugs.json OK)"

# 2. Build (SSG: ssr:false + prerender) — EM WORKTREE LIMPO
echo ""
echo "=== Buildando landing-page (SSG) em worktree limpo ==="
cd "$WT_LANDING"
# node_modules: usa o pnpm store (offline) p/ nao refazer install do zero
pnpm install --offline 2>&1 | tail -2 || pnpm install 2>&1 | tail -2
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
        git worktree remove "$WT" --force 2>/dev/null || true
        exit 1
    fi
    export SWA_DEPLOY_TOKEN_LANDING="$TOKEN"
fi

# 4. Deploy (skip_app_build: o build já foi feito no worktree)
echo ""
echo "Deployando $WT_LANDING/build/client → $APP_NAME ($ENV)..."
swa deploy "$WT_LANDING/build/client" \
    --deployment-token "$SWA_DEPLOY_TOKEN_LANDING" \
    --app-name "$APP_NAME" \
    --env "$ENV" \
    --swa-config-location "$WT_LANDING"

echo ""
echo "=== ✅ Deploy concluído! ==="
echo "   Site: https://cryptobingo.bet (ou test.cryptobingo.bet)"

# 5. Limpeza: remover worktree limpo
echo ""
echo "=== Removendo worktree limpo $WT ==="
git worktree remove "$WT" --force 2>/dev/null || true
echo "✅ worktree removido"

echo ""
echo "=== Pós-deploy: verificação manual ==="
echo "   1. Abrir https://cryptobingo.bet/blog e uma postagem individual"
echo "   2. F12 → Network — o HTML deve vir pré-renderizado (não SPA fallback)"
echo "   3. Validar via scripts/validate-vps-health.sh (rotas da landing-api)"
