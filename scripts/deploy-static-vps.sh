#!/usr/bin/env bash
# deploy-static-vps.sh — Build + deploy de frontend/landing/swap-ui para o nginx da VPS
# (substitui deploy-frontend.sh / deploy-landing.sh que usavam Azure SWA). ADR-060.
#
# Uso:
#   bash scripts/deploy-static-vps.sh <app> [--no-build]
#   app ∈ {landing, frontend, swap-ui}
#
# Fluxo:
#   1. Build no worktree atual (espera-se /tmp limpo) OU usa dist existente com --no-build
#   2. rsync do artefato → /opt/cryptobingo/static/<app> na VPS
#   3. nginx -s reload no container cryptobingo-nginx
#
# Pré-requisitos: ssh vps configurado; VPS com volume static montado no nginx.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-}"

if [[ -z "$APP" || ! "$APP" =~ ^(landing|frontend|swap-ui)$ ]]; then
    echo "❌ Uso: bash scripts/deploy-static-vps.sh <landing|frontend|swap-ui> [--no-build]"
    exit 1
fi
NO_BUILD="${2:-}"

VPS_HOST="vps"
STATIC_ROOT="/opt/cryptobingo/static"
NGINX_CONTAINER="cryptobingo-nginx"

# Mapeia app → dir de build local → env de produção
case "$APP" in
    landing)
        BUILD_DIR="$ROOT_DIR/apps/landing-page/build/client"
        FILTER="@cryptobingo/landing-page"
        ENV_MODE=""  # landing usa VITE_API_URL absoluto em build time
        ;;
    frontend)
        BUILD_DIR="$ROOT_DIR/apps/frontend/dist"
        FILTER="@cryptobingo/frontend"
        ENV_MODE="production"
        ;;
    swap-ui)
        BUILD_DIR="$ROOT_DIR/apps/swap-ui/dist"
        FILTER="@cryptobingo/swap-ui"
        ENV_MODE="production"
        ;;
esac

echo "=== Deploy static: $APP (VPS nginx) ==="

if [[ "$NO_BUILD" != "--no-build" ]]; then
    echo "→ Build ($FILTER)..."

    # === Configura env de produção (PEÇA ESQUECIDA na migração SWA→VPS #465) ===
    # .env.production (frontend) e .env (swap-ui) são gitignored → ausentes em
    # worktree limpo. Sem eles o Vite embute fallbacks errados (localhost,
    # chain ID local, stats '—', Wharfkit 'reading array'). Replica o que o
    # deploy-frontend.sh (SWA, deletado) fazia: garantir .env.production.
    APP_ENV="$ROOT_DIR/apps/$APP/.env.production"
    if [[ "$APP" == "landing" ]]; then
        # landing usa VITE_API_URL absoluto (host landing-api, NUNCA relativo '/api')
        export VITE_API_URL="https://landing-api.cryptobingo.bet/api"
        echo "   landing: VITE_API_URL=$VITE_API_URL (host absoluto)"
    elif [[ "$APP" == "frontend" ]]; then
        if [[ -f "$APP_ENV" ]]; then
            echo "   frontend: .env.production OK"
        else
            echo "❌ frontend .env.production ausente em $APP_ENV"; exit 1
        fi
    elif [[ "$APP" == "swap-ui" ]]; then
        if [[ ! -f "$APP_ENV" ]]; then
            cat > "$APP_ENV" <<'EOF'
VITE_API_GATEWAY_URL=https://test-api.cryptobingo.bet
VITE_WAX_RPC_URL=https://waxtestnet.greymass.com
VITE_CHAIN_ID=f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12
VITE_SWAP_CONTRACT=bingogameswp
VITE_GAME_URL=https://test.cryptobingo.bet
VITE_EXPLORER_URL=https://testnet.waxblock.io
EOF
            echo "   swap-ui: .env.production (testnet) criado"
        else
            echo "   swap-ui: .env.production OK"
        fi
    fi

    if [[ "$APP" == "landing" ]]; then
        # landing-page SSG exige submodule content/ (slugs.json)
        git submodule update --init --recursive
    fi
    (cd "$ROOT_DIR" && pnpm --filter "$FILTER" build)
    # Gate CSP (frontend/swap-ui têm staticwebapp.config.json; landing também)
    if [[ -f "$ROOT_DIR/apps/$APP/staticwebapp.config.json" ]]; then
        echo "→ Validando CSP (gate anti-regressão)..."
        "$ROOT_DIR/scripts/validate-csp.sh" "$ROOT_DIR/apps/$APP/staticwebapp.config.json" \
            || { echo "❌ CSP incompleta — corrija antes do deploy."; exit 1; }
    fi
    # Verifica JS compilado contra URLs de dev (localhost)
    echo "→ Verificando JS compilado contra URLs de dev..."
    DEVTECT=0
    for f in "$BUILD_DIR"/assets/index-*.js; do
        [[ -f "$f" ]] || continue
        if grep -F -E "localhost:8083|127.0.0.1:8888|127.0.0.1:8085" "$f" >/dev/null 2>&1; then
            echo "❌ $f contém URL de dev embutida!"; DEVTECT=1
        fi
    done
    [[ "$DEVTECT" -eq 0 ]] || { echo "❌ PARE: JS com URL de dev."; exit 1; }
else
    echo "→ Pulando build (--no-build)"
fi

if [[ ! -d "$BUILD_DIR" ]]; then
    echo "❌ Build dir ausente: $BUILD_DIR"; exit 1
fi

echo "→ rsync → $VPS_HOST:$STATIC_ROOT/$APP ..."
ssh "$VPS_HOST" "mkdir -p $STATIC_ROOT/$APP"
rsync -az --delete "$BUILD_DIR/" "$VPS_HOST:$STATIC_ROOT/$APP/"

echo "→ nginx -s reload ($NGINX_CONTAINER)..."
ssh "$VPS_HOST" "docker exec $NGINX_CONTAINER nginx -s reload"

# Purge Cloudflare (cutover step 2): o CF cacheia o HTML/asset antigo e a
# página pode continuar servindo o build anterior após reload.
if [[ -n "${CF_API_TOKEN:-}" && -n "${CF_ZONE_ID:-}" ]]; then
    echo "→ Purge Cloudflare cache (zone $CF_ZONE_ID)..."
    if curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
        -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
        --data '{"purge_everything":true}' | grep -q '"success":true'; then
        echo "   purge OK"
    else
        echo "   ⚠️ purge Falhou — purgue manualmente no dashboard CF"
    fi
else
    echo "⚠️ CF_API_TOKEN/CF_ZONE_ID não setados — purge Cloudflare MANUAL necessário"
fi

echo "=== ✅ Deploy $APP concluído ==="
case "$APP" in
    landing)   echo "   Site: https://cryptobingo.bet/  (301 → /en/)";;
    frontend)  echo "   Site: https://test.cryptobingo.bet";;
    swap-ui)   echo "   Site: https://test-swap.cryptobingo.bet";;
esac
echo "   Verifique: curl -sI https://<domain> | grep -i content-security-policy"
