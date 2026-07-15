#!/usr/bin/env bash
# validate-csp.sh — Gate de validação da Content-Security-Policy do frontend.
#
# OBJETIVO
#   Impedir que domínios de TERCEIROS que o app usa em runtime (analytics, RPC
#   WAX, fontes, wallets) fiquem BLOQUEADOS pela CSP em produção — a causa dos
#   erros recorrentes no console, ex.:
#     "Connecting to 'https://n.clarity.ms/collect' violates the CSP directive
#      connect-src ..."
#
# COMO FUNCIONA
#   Mantém uma LISTA CURADA (abaixo) dos domínios de terceiros que o app
#   realmente carrega, separada por diretiva. Faz parse da CSP em
#   staticwebapp.config.json e verifica se CADA domínio da lista está coberto
#   (match exato ou por wildcard *.dominio). Falha (exit 1) se faltar algum.
#
#   Um scan estático do código foi descartado de propósito: gera ruído (URLs em
#   comentários, docs, RPCs de outras chains embutidos no wharfkit). A lista
#   curada é determinística e reflete o que de fato roda em produção.
#
#   MANUTENÇÃO: ao adicionar um novo serviço de terceiro no frontend (novo
#   analytics, nova wallet, novo RPC), acrescente o domínio na lista da diretiva
#   correspondente. O gate então garante que a CSP acompanhou.
#
# Uso:  bash scripts/validate-csp.sh [caminho/para/staticwebapp.config.json]
#       (default: apps/frontend/staticwebapp.config.json)
#       Segundo argumento opcional URL: valida também o header AO VIVO
#       Ex.: bash scripts/validate-csp.sh "" https://test.cryptobingo.bet

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${1:-$ROOT_DIR/apps/frontend/staticwebapp.config.json}"
LIVE_URL="${2:-}"

if [ ! -f "$CONFIG" ]; then
    echo "❌ Config não encontrado: $CONFIG"
    exit 1
fi

echo "=== Validação de CSP ==="
echo "Config: $CONFIG"
[ -n "$LIVE_URL" ] && echo "Live:   $LIVE_URL"
echo ""

python3 - "$CONFIG" "$LIVE_URL" <<'PY'
import json, re, sys, subprocess

config_path, live_url = sys.argv[1], sys.argv[2]

# ─────────────────────────────────────────────────────────────────────────────
# LISTA CURADA: domínios de terceiros que o frontend USA em runtime, por
# diretiva. Adicione aqui ao introduzir um novo serviço externo.
# ─────────────────────────────────────────────────────────────────────────────
REQUIRED = {
    "connect-src": [
        "*.clarity.ms",                 # Microsoft Clarity -> n.clarity.ms/collect
        "www.google-analytics.com",     # GA4
        "www.googletagmanager.com",     # GTM
        "waxtestnet.greymass.com",      # RPC WAX (presets do dropdown do lobby)
        "wax-testnet.eosphere.io",
        "testnet.waxsweden.org",
        "testnet.wax.eosusa.io",
        "cb.anchor.link",               # Anchor wallet
        "wax-testnet.api.atomicassets.io",
    ],
    "script-src": [
        "*.clarity.ms",
        "www.googletagmanager.com",
        "cdn.jsdelivr.net",             # cookieconsent
    ],
}

with open(config_path) as f:
    cfg = json.load(f)
csp = cfg.get("globalHeaders", {}).get("Content-Security-Policy", "")
if not csp:
    print("❌ Nenhuma Content-Security-Policy em globalHeaders.")
    sys.exit(1)

def parse(csp_str):
    d = {}
    for part in csp_str.split(";"):
        toks = part.split()
        if toks:
            d[toks[0]] = set(toks[1:])
    return d

def host(src):
    s = re.sub(r'^[a-z]+://', '', src).strip("'")
    return s

def covered(domain, directive, directives):
    sources = directives.get(directive, set()) | directives.get("default-src", set())
    d = host(domain)
    for s in sources:
        sh = host(s)
        if sh == d:
            return True
        if sh.startswith("*.") and (d == sh[2:] or d.endswith("." + sh[2:])):
            return True
        if d.startswith("*.") and sh.endswith("." + d[2:]):
            return True  # config usa host específico coberto pelo wildcard exigido
    return False

def check(csp_str, label):
    directives = parse(csp_str)
    missing = []
    for directive, domains in REQUIRED.items():
        for dom in domains:
            if not covered(dom, directive, directives):
                missing.append((directive, dom))
    print(f"[{label}]")
    if missing:
        print("  ❌ CSP INCOMPLETA — faltam:")
        for directive, dom in missing:
            print(f"     - {dom}  em '{directive}'")
        return False
    print("  ✅ todos os domínios de terceiros exigidos estão cobertos")
    return True

ok = check(csp, "config")

# Validação opcional do header AO VIVO
if live_url:
    print("")
    try:
        out = subprocess.run(
            ["curl", "-sI", live_url], capture_output=True, text=True, timeout=20
        ).stdout
        live_csp = ""
        for line in out.splitlines():
            if line.lower().startswith("content-security-policy:"):
                live_csp = line.split(":", 1)[1].strip()
                break
        if not live_csp:
            print("[live] ⚠️  header Content-Security-Policy não encontrado (CDN ainda propagando?)")
        else:
            ok = check(live_csp, "live") and ok
    except Exception as e:
        print(f"[live] ⚠️  não foi possível checar ao vivo: {e}")

sys.exit(0 if ok else 1)
PY
