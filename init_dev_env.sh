#!/bin/bash
# Script de Reset e Provisionamento: init_dev_env.sh
# Ref: ADR-006 — bootstrap da rede local DUNE com múltiplos perfis de conta

set -euo pipefail

echo "[*] Destruindo containers..."
dune --destroy-container > /dev/null 2>&1

echo "[*] Subindo rede e realizando bootstrap do sistema..."
dune --start bingo_testnet

# A MÁGICA: Capturamos a saída do comando para extrair as chaves dinâmicas
BOOTSTRAP_LOG=$(dune --bootstrap-system-full WAX 1000000000.0000 1000000.0000 2>&1)
echo "$BOOTSTRAP_LOG"

echo "[*] Gerando chaves e configurando contas..."

# Chave mestre fixa
EOSIO_PRIV="5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3"

# Chave dinâmica do eosio.token extraída do log
EOSIO_TOKEN_PRIV=$(echo "$BOOTSTRAP_LOG" | grep "Creating account \[eosio.token\]" | sed -n 's/.*Private: \([^,]*\).*/\1/p')

# Criamos o arquivo .dune.env com a nova chave!
cat <<EOF > .dune.env
EOSIO_KEY=$EOSIO_PRIV
EOSIO_TOKEN_KEY=$EOSIO_TOKEN_PRIV
EOF

# Lista de todas as contas gerenciadas
# Formato: "nome_da_conta"
ACCOUNT_NAMES=(
    orng.wax
    bingo.game
    alien.worlds
    jogador1
    jogador2
    gameadmin11
    contractad1
    sponsor1111
)

# Função para criar conta, gerar chaves e salvar em .dune.env
create_managed_account() {
    local name=$1
    echo "[*] Processando: $name"
    
    KEYS=$(dune --create-key)
    PRIV=$(echo "$KEYS" | grep "Private key" | awk '{print $3}')
    PUB=$(echo "$KEYS" | grep "Public key" | awk '{print $3}')
    
    dune -- cleos system newaccount eosio $name $PUB --stake-net "1000.0000 WAX" --stake-cpu "1000.0000 WAX" --buy-ram-bytes 8192000
    
    VAR_NAME=$(echo $name | tr '.' '_' | tr '[:lower:]' '[:upper:]')
    echo "${VAR_NAME}_KEY=$PRIV" >> .dune.env
}

# Processa as contas
for acc in "${ACCOUNT_NAMES[@]}"; do
    create_managed_account $acc
    dune --import-dev-key $PRIV
done

# 1. Cria a conta dedicada para o token do projeto
# Gera chave para bingo.token e cria a conta
BINGO_TOKEN_KEYS=$(dune --create-key)
BINGO_TOKEN_PRIV=$(echo "$BINGO_TOKEN_KEYS" | grep "Private key" | awk '{print $3}')
BINGO_TOKEN_PUB=$(echo "$BINGO_TOKEN_KEYS" | grep "Public key" | awk '{print $3}')
dune -- cleos system newaccount eosio bingo.token "$BINGO_TOKEN_PUB" --stake-net "1000.0000 WAX" --stake-cpu "1000.0000 WAX" --buy-ram-bytes 8192000
dune --import-dev-key "$BINGO_TOKEN_PRIV"
echo "BINGO_TOKEN_KEY=$BINGO_TOKEN_PRIV" >> .dune.env

# 2. Faz o deploy do contrato padrão de tokens para esta nova conta
dune -- cleos set contract bingo.token /usr/share/leap_testing/unittests/contracts/eosio.token

# 3. Cria o token BINGO com 4 casas decimais gerenciado por bingo.token
dune -- cleos push action bingo.token create '["bingo.game", "1000000000.0000 BINGO"]' -p bingo.token@active

# 4. Emite a quantidade inicial para a conta do jogo gerenciar os prêmios/drops
dune -- cleos push action bingo.token issue '["bingo.game", "500000000.0000 BINGO", "Emissão Inicial CriptoBingo"]' -p bingo.game@active

# 5. Distribui BINGO para contas de desenvolvimento
echo "[*] Distribuindo BINGO para contas de desenvolvimento..."
for dest in jogador1 jogador2 gameadmin11 contractad1 sponsor1111; do
    # Abre saldo se necessário
    dune -- cleos push action bingo.token open \
        "[\"$dest\", \"4,BINGO\", \"bingo.game\"]" -p bingo.game@active > /dev/null 2>&1 || true
    # Transfere 10000 BINGO
    dune -- cleos push action bingo.token transfer \
        "[\"bingo.game\", \"$dest\", \"10000.0000 BINGO\", \"Tokens de desenvolvimento\"]" -p bingo.game@active
done

# 6. Faz o deploy do contrato bingo.game (nosso jogo)
echo "[*] Deploy do contrato bingo.game..."
CONTRACT_DIR="contracts/bingo"
if [ -f "$CONTRACT_DIR/bingo.wasm" ] && [ -f "$CONTRACT_DIR/bingo.abi" ]; then
    CONTAINER_PATH="/app/contracts/bingo"
    docker exec dunes_container mkdir -p "$CONTAINER_PATH"
    docker cp "$CONTRACT_DIR/bingo.wasm" dunes_container:"$CONTAINER_PATH/bingo.wasm"
    docker cp "$CONTRACT_DIR/bingo.abi" dunes_container:"$CONTAINER_PATH/bingo.abi"
    dune -- cleos set contract bingo.game "$CONTAINER_PATH" -p bingo.game@active

    echo "[*] Adicionando permissão eosio.code ao bingo.game (necessário para inline actions como withdraw)..."
    dune -- cleos set account permission bingo.game active --add-code -p bingo.game@active
else
    echo "[!] Aviso: contrato bingo não encontrado em $CONTRACT_DIR — deploy manual necessário"
    echo "    Esperado: $CONTRACT_DIR/bingo.wasm e $CONTRACT_DIR/bingo.abi"
fi

echo "[*] Finalizando configurações..."
CHAIN_ID=$(curl -s http://127.0.0.1:8888/v1/chain/get_info | jq -r '.chain_id')
echo "CHAIN_ID=$CHAIN_ID" >> .dune.env
echo "RPC_URL=http://127.0.0.1:8888" >> .dune.env

# ──────────────────────────────────────────────────────────────────────────────
# PROPAGA .dune.env → .env FILES DOS APPS
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Propagando chaves para .env dos apps..."

source .dune.env

_upsert_env() {
    local file=$1 key=$2 value=$3
    if [ ! -f "$file" ]; then
        echo "$key=$value" > "$file"
        return
    fi
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
        echo "$key=$value" >> "$file"
    fi
}

# ── apps/frontend/.env (VITE_* para dev login + conexões) ──────────────────
F="apps/frontend/.env"
mkdir -p "$(dirname "$F")"

_upsert_env "$F" "VITE_CHAIN_ID" "$CHAIN_ID"
_upsert_env "$F" "VITE_RPC_URL" "http://127.0.0.1:8888"
_upsert_env "$F" "VITE_API_GATEWAY_URL" "http://localhost:8083"
_upsert_env "$F" "VITE_CONTRACT_ACCOUNT" "bingo.game"
_upsert_env "$F" "VITE_EXPLORER_URL" "https://wax.bloks.io"
_upsert_env "$F" "VITE_WS_URL" ""
_upsert_env "$F" "VITE_WS_URL_INTERNAL" "http://127.0.0.1:8085"
_upsert_env "$F" "VITE_DEV_SESSION" "true"
_upsert_env "$F" "VITE_DEV_ACTOR" "jogador1"
_upsert_env "$F" "VITE_DEV_PRIVATE_KEY" "$JOGADOR1_KEY"
_upsert_env "$F" "VITE_DEV_ACTOR_JOGADOR2" "jogador2"
_upsert_env "$F" "VITE_DEV_KEY_JOGADOR2" "$JOGADOR2_KEY"
_upsert_env "$F" "VITE_DEV_ACTOR_GAME_ADMIN" "gameadmin11"
_upsert_env "$F" "VITE_DEV_KEY_GAME_ADMIN" "$GAMEADMIN11_KEY"
_upsert_env "$F" "VITE_DEV_ACTOR_CONTRACT_ADMIN" "contractad1"
_upsert_env "$F" "VITE_DEV_KEY_CONTRACT_ADMIN" "$CONTRACTAD1_KEY"
_upsert_env "$F" "VITE_DEV_ACTOR_SPONSOR" "sponsor1111"
_upsert_env "$F" "VITE_DEV_KEY_SPONSOR" "$SPONSOR1111_KEY"

# ── apps/api-gateway/.env ──────────────────────────────────────────────────
F="apps/api-gateway/.env"
mkdir -p "$(dirname "$F")"

# Gera JWT_SECRET compartilhado se não existir ainda, ou extrai do .env existente
if grep -q "^JWT_SECRET=" "$F" 2>/dev/null; then
    JWT_SECRET=$(grep "^JWT_SECRET=" "$F" | head -1 | cut -d= -f2-)
else
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "dev_jwt_secret_change_in_production")
fi

_upsert_env "$F" "PORT" "8083"
_upsert_env "$F" "CHAIN_ID" "$CHAIN_ID"
_upsert_env "$F" "RPC_URL" "$RPC_URL"
_upsert_env "$F" "POSTGRES_URL" "postgres://bingo_admin:bingo_secure_pass_2026@localhost:5432/cryptobingo_ledger"
_upsert_env "$F" "MONGO_URL" "mongodb://mongo_admin:mongo_secure_pass_2026@localhost:27017/cryptobingo_edge?authSource=admin"
_upsert_env "$F" "REDIS_URL" "redis://localhost:6379"
_upsert_env "$F" "CONTRACT_ACCOUNT" "bingo.game"
_upsert_env "$F" "MICROSERVICE_PRIVATE_KEY" "$BINGO_GAME_KEY"
_upsert_env "$F" "JWT_SECRET" "$JWT_SECRET"
_upsert_env "$F" "ALLOWED_ORIGINS" "http://localhost:5173,http://localhost:3000"
_upsert_env "$F" "VERIFY_KEY_ONCHAIN" "false"

# ── apps/worker-game-loop/.env ─────────────────────────────────────────────
F="apps/worker-game-loop/.env"
mkdir -p "$(dirname "$F")"

_upsert_env "$F" "CHAIN_ID" "$CHAIN_ID"
_upsert_env "$F" "RPC_URL" "$RPC_URL"
_upsert_env "$F" "CONTRACT_ACCOUNT" "bingo.game"
_upsert_env "$F" "MICROSERVICE_PRIVATE_KEY" "$BINGO_GAME_KEY"
_upsert_env "$F" "POSTGRES_URL" "postgres://bingo_admin:bingo_secure_pass_2026@localhost:5432/cryptobingo_ledger"
_upsert_env "$F" "REDIS_URL" "redis://localhost:6379"
_upsert_env "$F" "RABBITMQ_URL" "amqp://rabbit_admin:rabbit_secure_pass_2026@localhost:5672"
_upsert_env "$F" "RABBITMQ_MAX_RETRIES" "3"
_upsert_env "$F" "JWT_SECRET" "$JWT_SECRET"
_upsert_env "$F" "WS_PORT" "8085"
_upsert_env "$F" "REVEAL_INTERVAL" "3000"
_upsert_env "$F" "WS_MAX_CONNECTIONS_PER_IP" "10"
_upsert_env "$F" "ALLOWED_ORIGIN" "http://localhost:5173"
_upsert_env "$F" "METRICS_PORT" "9091"
_upsert_env "$F" "INDEXER_INTERVAL_MS" "15000"

# ── root .env (usado pelo docker-compose via env_file + auto-load) ─────────
_upsert_env ".env" "EOSIO_KEY" "$EOSIO_PRIV"
_upsert_env ".env" "CHAIN_ID" "$CHAIN_ID"
_upsert_env ".env" "RPC_URL" "http://host.docker.internal:8888"
_upsert_env ".env" "MONGO_INITDB_ROOT_USERNAME" "mongo_admin"
_upsert_env ".env" "MONGO_INITDB_ROOT_PASSWORD" "mongo_secure_pass_2026"
_upsert_env ".env" "POSTGRES_USER" "bingo_admin"
_upsert_env ".env" "POSTGRES_DB" "cryptobingo_ledger"
_upsert_env ".env" "VITE_CHAIN_ID" "$CHAIN_ID"
_upsert_env ".env" "VITE_RPC_URL" "http://127.0.0.1:8888"
_upsert_env ".env" "VITE_API_GATEWAY_URL" "http://localhost:8083"
_upsert_env ".env" "VITE_WS_URL" "http://localhost:8085"
_upsert_env ".env" "VITE_CONTRACT_ACCOUNT" "bingo.game"

# ── .dev.env (agregado completo para referência / CI) ──────────────────────
echo "[*] Gerando .dev.env (agregado completo)..."
{
    echo "# ================================================================"
    echo "# .dev.env — Agregado completo do ambiente de desenvolvimento"
    echo "# Gerado automaticamente por init_dev_env.sh em $(date +%Y-%m-%d)"
    echo "# ATENÇÃO: contém chaves privadas — NUNCA commitar"
    echo "# ================================================================"
    echo ""
    echo "# ── Root ────────────────────────────────────────────────────────"
    grep -v '^#' ".env" 2>/dev/null | grep -v '^$' || true
    echo ""
    echo "# ── DUNES / Blockchain ──────────────────────────────────────────"
    grep -v '^#' ".dune.env" 2>/dev/null | grep -v '^$' || true
    echo ""
    echo "# ── Frontend (apps/frontend/.env) ───────────────────────────────"
    grep -v '^#' "apps/frontend/.env" 2>/dev/null | grep -v '^$' || true
    echo ""
    echo "# ── API Gateway (apps/api-gateway/.env) ─────────────────────────"
    grep -v '^#' "apps/api-gateway/.env" 2>/dev/null | grep -v '^$' || true
    echo ""
    echo "# ── Worker Game Loop (apps/worker-game-loop/.env) ───────────────"
    grep -v '^#' "apps/worker-game-loop/.env" 2>/dev/null | grep -v '^$' || true
} > .dev.env

# ── Conecta DUNES à rede da compose (se já existir) ─────────────────────────
if docker network ls --format '{{.Name}}' | grep -q 'bingo_net'; then
  echo "[*] Conectando dunes_container à rede da compose..."
  docker network connect cryptobingo-infra_bingo_net dunes_container 2>/dev/null || true

  # Promove contas admin no MongoDB (se container estiver rodando)
  if docker ps --format '{{.Names}}' | grep -q 'bingo_mongodb'; then
    echo "[*] Promovendo contas admin no MongoDB..."
    docker exec bingo_mongodb mongosh --username mongo_admin --password mongo_secure_pass_2026 \
      --authenticationDatabase admin cryptobingo_edge \
      --eval 'db.userprofiles.updateMany({wallet_address:{$in:["gameadmin11","contractad1"]}},{$set:{role:"admin"}})' \
      2>/dev/null || true
  fi
fi

echo "✅ Ambiente pronto! Contas criadas: ${ACCOUNT_NAMES[*]}"
echo "   → .dev.env gerado com todas as variáveis"
echo "   → Após 'docker compose up -d', execute novamente para conectar DUNES e promover admins:"
echo "     docker network connect cryptobingo-infra_bingo_net dunes_container"