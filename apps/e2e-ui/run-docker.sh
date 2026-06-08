#!/usr/bin/env bash
# Roda a suíte Cypress dentro da imagem oficial cypress/included.
#
# Por quê: em hosts Linux modernos (ex.: Ubuntu 24.04 / WSL2) a restrição de
# user-namespaces do AppArmor quebra o sandbox do Electron do Cypress nativo
# ("bad option: --no-sandbox"). A imagem oficial traz Electron + libs de SO e
# roda headless sem esse problema. Em CI (ubuntu-latest) o nativo funciona via
# cypress-io/github-action; este script é para execução LOCAL. Ref: ADR-017.
#
# Pré-requisito: `vite dev` do frontend já no ar na 5173
#   pnpm --filter @cryptobingo/frontend dev
#
# Uso: bash run-docker.sh [tier=1|tier=2] [args extras do cypress run]
set -euo pipefail

TIER_ARG="${1:-tier=1}"; shift || true
CYPRESS_VERSION="13.17.0"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_URL="${CYPRESS_BASE_URL:-http://127.0.0.1:5173}"

exec docker run --rm --network host \
  -v "${REPO_ROOT}:/e2e" \
  -w /e2e/apps/e2e-ui \
  --entrypoint cypress \
  "cypress/included:${CYPRESS_VERSION}" \
  run --env "${TIER_ARG}" --browser electron \
  --config "baseUrl=${BASE_URL}" "$@"
