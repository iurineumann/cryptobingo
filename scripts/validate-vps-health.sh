#!/usr/bin/env bash
# validate-vps-health.sh — Validação de saúde da VPS após reboot/manutenção.
#
# CONTEXTO (RAG: agent://infra/vps/architecture-2026-07-13 + agent://infra/redis-acl-gotcha-2026-07-14)
#   VPS Contabo 13.140.172.222 roda todos os containers Docker do testnet:
#   postgres, mongo, redis (ACL appuser), rabbitmq, pgbouncer, landing-api,
#   api-gateway, worker-game-loop, oracle-daemon, nginx (proxy reverso TLS).
#   Frontend/swap-ui ficam em Azure SWA (fora da VPS).
#
# OBJETIVO
#   Após um reboot da VPS, confirmar que TUDO voltou: containers up, redis ACL
#   ok (appuser autentica — a gotcha de 2026-07-14), api-gateway responde 200
#   em /api/v1/rooms e /api/v1/profile, e o frontend tem CSP válida ao vivo.
#
# USO
#   bash scripts/validate-vps-health.sh [VPS_HOST]
#     VPS_HOST default: vps  (entrada SSH do ~/.ssh/config)
#
# SAÍDA
#   exit 0 = tudo verde; exit 1 = algum check falhou (lista o que falhou).
#
# SEGURANÇA
#   Não hardcodar senhas. A senha do redis é lida do /opt/cryptobingo/redis.conf
#   NA VPS via ssh (só root/vps tem acesso). Testnet keys (RAG ADR-046) — ok.

set -uo pipefail

VPS="${1:-vps}"
REDIS_CONF="/opt/cryptobingo/redis.conf"
FRONTEND_URL="https://test.cryptobingo.bet"
API_URL="https://test-api.cryptobingo.bet"

# Containers essenciais que DEVEM estar Up após reboot.
ESSENTIAL="postgres mongo redis rabbitmq landing-api api-gateway worker-game-loop oracle-daemon cryptobingo-nginx"

PASS=0
FAIL=0
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }

echo "=== Validação de saúde da VPS ($VPS) ==="
echo ""

# ── 1. Containers up ────────────────────────────────────────────────────────
echo "[1/4] Containers Docker essenciais"
UP=$(ssh -o ConnectTimeout=15 "$VPS" "docker ps --format '{{.Names}} {{.Status}}'" 2>/dev/null) || {
    echo "  ❌ não conseguiu conectar via ssh em $VPS"; exit 1; }
for c in $ESSENTIAL; do
    line=$(echo "$UP" | grep -E "^${c} " || true)
    if echo "$line" | grep -qiE "Up"; then
        ok "$c está Up"
    else
        fail "$c AUSENTE/NÃO-UP ($(echo "$line" | awk '{print $2, $3}' | tr -d '\n'))"
    fi
done
echo ""

# ── 2. Redis ACL (appuser autentica) ────────────────────────────────────────
echo "[2/4] Redis ACL (appuser deve autenticar — gotcha 2026-07-14)"
REDIS_PW=$(ssh "$VPS" "grep -oE 'requirepass[[:space:]]+[^[:space:]]+' $REDIS_CONF 2>/dev/null | awk '{print \$2}'" 2>/dev/null)
if [ -z "$REDIS_PW" ]; then
    fail "não conseguiu ler requirepass de $REDIS_CONF na VPS"
else
    WHO=$(ssh "$VPS" "docker exec redis redis-cli -u redis://appuser:${REDIS_PW}@redis:6379 ACL WHOAMI" 2>/dev/null | tr -d '\r')
    if [ "$WHO" = "appuser" ]; then
        ok "redis ACL: appuser autenticou (WHOAMI=appuser)"
    else
        fail "redis ACL: appuser NÃO autenticou (WHOAMI='$WHO')"
    fi
fi
echo ""

# ── 3. API 200 em /rooms e /profile ─────────────────────────────────────────
echo "[3/4] api-gateway (test-api.cryptobingo.bet)"
# /rooms é público (200). /profile exige JWT: 200 (com token) OU 401 (sem token)
# ambos indicam API viva + auth funcionando. Só 500/000/timeout = falha.
for pair in "/api/v1/rooms:200" "/api/v1/profile:200,401"; do
    path="${pair%%:*}"; expected="${pair##*:}"
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$API_URL$path" 2>/dev/null)
    if echo ",$expected," | grep -q ",$code,"; then
        ok "GET $path -> $code (esperado $expected)"
    else
        fail "GET $path -> ${code:-sem resposta} (esperado $expected)"
    fi
done
echo ""

# ── 4. CSP ao vivo (reusa o gate de CSP, se disponível) ─────────────────────
echo "[4/4] CSP ao vivo (frontend)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/validate-csp.sh" ]; then
    if bash "$SCRIPT_DIR/validate-csp.sh" "" "$FRONTEND_URL" >/tmp/csp-check.out 2>&1; then
        ok "CSP ao vivo validada (veja detalhe abaixo)"
        sed -n '/\[live\]/,/^$/p' /tmp/csp-check.out | sed 's/^/    /'
    else
        fail "CSP ao vivo FALHOU (detail abaixo)"
        sed -n '/\[live\]/,/^$/p' /tmp/csp-check.out | sed 's/^/    /'
    fi
else
    echo "  ⚠️  validate-csp.sh não encontrado — pulando check de CSP ao vivo"
fi
echo ""

# ── Resumo ───────────────────────────────────────────────────────────────────
echo "=== Resumo: $PASS OK, $FAIL FALHA(S) ==="
[ "$FAIL" -eq 0 ]
