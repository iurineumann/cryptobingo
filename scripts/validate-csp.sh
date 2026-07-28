#!/usr/bin/env bash
#
# validate-csp.sh — Gate de CSP para os frontends estáticos no nginx VPS.
#
# O que valida:
#   1. Sintaxe do nginx no container VPS (nginx -t).
#   2. O header Content-Security-Policy SERVIDO EM PRODUÇÃO contém os
#      domínios esperados em cada directive (img-src, script-src, connect-src).
#
# Por que existe: mudanças em infra/nginx/apps.conf não têm suíte pnpm.
# Este script é o "teste" equivalente — quebra o deploy se o CSP servido
# divergir do esperado (ex.: bind mount obsoleto do container, Cloudflare
# servindo header antigo, domínio esquecido).
#
# Uso:
#   scripts/validate-csp.sh                       # defaults (landing www)
#   CSP_URL=https://test.cryptobingo.bet scripts/validate-csp.sh
#   SKIP_NGINX_T=1 scripts/validate-csp.sh        # pula o nginx -t (só header)
#
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
VPS_HOST="${VPS_HOST:-vps}"
NGINX_CONTAINER="${NGINX_CONTAINER:-cryptobingo-nginx}"
CSP_URL="${CSP_URL:-https://www.cryptobingo.bet/en/blog}"
SKIP_NGINX_T="${SKIP_NGINX_T:-0}"

# Domínios esperados por directive (SWA parity + ajustes deste projeto).
# clarity.ms/bing  → Microsoft Clarity (pixel c.bing.com/c.gif)
# unsplash.com     → imagens do blog (landing)
# google-analytics → fallback <img> do GTM/GA quando beacon é bloqueado
EXPECTED_IMG=(
  "https://www.googletagmanager.com"
  "https://ssl.gstatic.com"
  "https://*.clarity.ms"
  "https://*.bing.com"
  "https://images.unsplash.com"
  "https://www.google-analytics.com"
  "https://static.cloudflareinsights.com"
)
EXPECTED_SCRIPT=(
  "https://www.googletagmanager.com"
  "https://tagmanager.google.com"
  "https://*.clarity.ms"
  "https://*.bing.com"
  "https://images.unsplash.com"
  "https://www.google-analytics.com"
  "https://cdn.jsdelivr.net"
  "https://static.cloudflareinsights.com"
)
EXPECTED_CONNECT=(
  "https://*.cryptobingo.bet"
  "https://www.google-analytics.com"
  "https://analytics.google.com"
  "https://*.clarity.ms"
  "https://*.bing.com"
  "https://images.unsplash.com"
  "https://static.cloudflareinsights.com"
)

log()  { printf '[validate-csp] %s\n' "$*"; }
fail() { printf '[validate-csp] FAIL: %s\n' "$*" >&2; exit 1; }

# ── 1. nginx -t no container VPS ──────────────────────────────────────
if [[ "$SKIP_NGINX_T" != "1" ]]; then
  log "Rodando nginx -t no container $NGINX_CONTAINER ($VPS_HOST)…"
  if ! ssh "$VPS_HOST" "docker exec $NGINX_CONTAINER nginx -t" 2>&1 \
       | grep -q "test is successful"; then
    fail "nginx -t falhou no container $NGINX_CONTAINER (ssh $VPS_HOST)"
  fi
  log "nginx -t OK"
else
  log "nginx -t pulado (SKIP_NGINX_T=1)"
fi

# ── 2. Buscar header CSP servido em produção ──────────────────────────
log "Buscando header CSP em $CSP_URL…"
# cache-bust para evitar resposta cacheada do Cloudflare
URL_WITH_CB="${CSP_URL}${CSP_URL:+?}"
URL_WITH_CB="${CSP_URL}$( [[ "$CSP_URL" == *\?* ]] && echo '&' || echo '?' )cb=$(date +%s)"
HEADER="$(curl -fsS -D - -o /dev/null "$URL_WITH_CB" 2>/dev/null \
          | grep -i '^content-security-policy:' | head -1 || true)"

[[ -n "$HEADER" ]] || fail "Header Content-Security-Policy não encontrado em $CSP_URL"
log "Header CSP obtido ($(wc -c <<<"$HEADER") bytes)"

# Extrai o valor de uma directive do header CSP.
# Uso: directive_value "img-src" "$HEADER"
directive_value() {
  local dir="$1" hdr="$2"
  # pega o valor da directive: tudo entre "$dir " e o próximo ";"
  printf '%s' "$hdr" | grep -oiE "${dir}[[:space:]]+[^;]*" | head -1 | sed "s/^${dir}[[:space:]]*//I" | tr -d '\r'
}

check_directive() {
  local dir="$1"; shift
  local value; value="$(directive_value "$dir" "$HEADER")"
  [[ -n "$value" ]] || fail "Directive '$dir' ausente no CSP servido"
  local missing=()
  for want in "$@"; do
    # comparação tolerante: *.clarity.ms casa clarity.ms e subdomínios
    if [[ "$want" == *'*.'* ]]; then
      local base="${want#\*.*}"
      [[ "$value" == *"$base"* ]] || missing+=("$want")
    else
      [[ "$value" == *"$want"* ]] || missing+=("$want")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    fail "'$dir' servido está faltando: ${missing[*]}  | valor atual: $value"
  fi
  log "'$dir' OK (${#@} domínios esperados presentes)"
}

# ── 3. Checar directives ───────────────────────────────────────────────
check_directive "img-src"          "${EXPECTED_IMG[@]}"
check_directive "script-src"       "${EXPECTED_SCRIPT[@]}"
check_directive "connect-src"      "${EXPECTED_CONNECT[@]}"

log "SUCESSO — CSP servido em produção está conforme o esperado."
