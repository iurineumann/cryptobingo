#!/usr/bin/env bash
# deploy-frontend.sh — Build + deploy manual do frontend para Azure Static Web Apps
# Uso: bash scripts/deploy-frontend.sh
#
# Pré-requisitos:
#   - swa CLI (npm install -g @azure/static-web-apps-cli)
#   - Azure CLI logado com acesso ao SWA
#   - Token de deploy (SWA_DEPLOY_TOKEN_FRONTEND)
#
# Fluxo:
#   1. Verifica env vars de produção (NUNCA buildar sem)
#   2. Build com VITE_* de produção
#   3. Verifica se o JS gerado não tem URLs de dev (localhost)
#   4. Deploy para Azure SWA

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/apps/frontend"
DIST_DIR="$FRONTEND_DIR/dist"
APP_NAME="cryptobingo-frontend"
ENV="production"

echo "=== Deploy Frontend ==="

# 1. Verificar se .env.production existe (build usa mode=production → .env.production)
if [ ! -f "$FRONTEND_DIR/.env.production" ]; then
    echo "❌ .env.production não encontrado em $FRONTEND_DIR"
    echo "   Crie a partir de .env.testnet ou copie manualmente."
    exit 1
fi

echo "✅ .env.production encontrado"

# 2. Verificar URLs de produção nas env vars
echo ""
echo "=== Verificando env vars de produção ==="
grep -E "^VITE_API_GATEWAY_URL=" "$FRONTEND_DIR/.env.production" || echo "⚠️  VITE_API_GATEWAY_URL não definido"
grep -E "^VITE_RPC_URL=" "$FRONTEND_DIR/.env.production" || echo "⚠️  VITE_RPC_URL não definido"

# Extrair valores para verificação
API_URL=$(grep -E "^VITE_API_GATEWAY_URL=" "$FRONTEND_DIR/.env.production" | cut -d= -f2)
RPC_URL=$(grep -E "^VITE_RPC_URL=" "$FRONTEND_DIR/.env.production" | cut -d= -f2)

if echo "$API_URL" | grep -qi "localhost\|127.0.0.1"; then
    echo "❌ VITE_API_GATEWAY_URL aponta para localhost: $API_URL"
    exit 1
fi
if echo "$RPC_URL" | grep -qi "localhost\|127.0.0.1"; then
    echo "❌ VITE_RPC_URL aponta para localhost: $RPC_URL"
    exit 1
fi
echo "✅ URLs de produção verificadas:"
echo "   API: $API_URL"
echo "   RPC: $RPC_URL"

# 3. Build
echo ""
echo "=== Buildando frontend ==="
cd "$FRONTEND_DIR"
pnpm build
echo "✅ Build concluído"

# 4.5. Gate de CSP — impede deploy com domínios de terceiros bloqueados
#      (ex.: Clarity em connect-src). Falha o deploy se a CSP estiver incompleta.
echo ""
echo "=== Validando Content-Security-Policy (gate anti-regressão) ==="
"$ROOT_DIR/scripts/validate-csp.sh" "$FRONTEND_DIR/staticwebapp.config.json" || {
    echo "❌ CSP incompleta — corrija staticwebapp.config.json ANTES do deploy."
    exit 1
}
echo "✅ CSP validada"

# Verificar JS compilado — URLs de dev embutidas (VITE_*)
# NOTA: React Router DOM tem código interno com "http://localhost" (fallback URL).
# Só verificamos URLs ESPECÍFICAS de dev que viriam de VITE_* env vars erradas.
echo ""
echo "=== Verificando JS compilado contra URLs de dev ==="
DEV_PATTERNS=(
    "localhost:8083"
    "127.0.0.1:8888"
    "127.0.0.1:8085"
)
DEVTECT=0
for f in "$DIST_DIR"/assets/index-*.js; do
    for pat in "${DEV_PATTERNS[@]}"; do
        if grep -F "$pat" "$f" >/dev/null 2>&1; then
            echo "❌ $f contém '$pat' — VITE_* env var de desenvolvimento embutida!"
            DEVTECT=1
        fi
    done
done
if [ "$DEVTECT" -eq 1 ]; then
    echo "❌ PARE: JS compilado contém URLs de desenvolvimento!"
    echo "   Verifique .env.production e rebuild."
    exit 1
fi
echo "✅ JS compilado OK — sem URLs de dev"

# 5. Deploy
echo ""
echo "=== Deployando para Azure SWA ==="
if [ -z "${SWA_DEPLOY_TOKEN_FRONTEND:-}" ]; then
    echo "⚠️  SWA_DEPLOY_TOKEN_FRONTEND não definido."
    echo "   Obtendo do Azure CLI..."
    TOKEN=$(az staticwebapp secrets list --name "$APP_NAME" \
        --resource-group cryptobingo-testnet \
        --query "properties.apiKey" -o tsv 2>/dev/null)
    if [ -z "$TOKEN" ]; then
        echo "❌ Não foi possível obter token automaticamente."
        echo "   Exporte SWA_DEPLOY_TOKEN_FRONTEND manualmente."
        exit 1
    fi
    export SWA_DEPLOY_TOKEN_FRONTEND="$TOKEN"
fi

echo "Deployando $DIST_DIR → $APP_NAME ($ENV)..."
swa deploy "$DIST_DIR" \
    --deployment-token "$SWA_DEPLOY_TOKEN_FRONTEND" \
    --app-name "$APP_NAME" \
    --env "$ENV" \
    --swa-config-location "$FRONTEND_DIR"

echo ""
echo "=== ✅ Deploy concluído! ==="
echo "   Site: https://test.cryptobingo.bet"
echo "   ⚠️  Edge CDN leva ~2min p/ propagar CSP"
echo ""
echo "=== Pós-deploy: verificação manual ==="
echo "   1. Abrir https://test.cryptobingo.bet"
echo "   2. F12 → Console — NÃO deve aparecer localhost/127.0.0.1"
echo "   3. CSP header: curl -sI https://test.cryptobingo.bet | grep content-security-policy"
