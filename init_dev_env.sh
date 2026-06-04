#!/bin/bash
# ============================================================
# init_dev_env.sh — Bootstrap do ambiente local CryptoBingo
# Utiliza waxteam/waxdev via Docker (substitui DUNES deprecated)
#
# Uso:
#   bash init_dev_env.sh          # setup completo (primeira vez)
#   bash init_dev_env.sh --reset  # destrói e recria tudo
#   bash init_dev_env.sh --envs   # só repropaga os .env (sem blockchain)
#
# Ref: ADR-006, SPEC.md §2
# ============================================================

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO
# ──────────────────────────────────────────────────────────────────────────────
WAXDEV_IMAGE="waxteam/waxdev:latest"
CONTAINER_NAME="bingo_waxdev"
NODEOS_PORT=8888
WALLET_DIR="/root/eosio-wallet"
DATA_DIR="/root/waxdev-data"
CONTRACT_SRC_HOST="$(pwd)/contracts/bingo"
CONTRACT_SRC_CONTAINER="/app/contracts/bingo"

# Binários: em /tmp/wax-blockchain/build/bin/ dentro da imagem
WAX_BIN="/tmp/wax-blockchain/build/bin"

# Chave padrão do eosio (bootstrap — igual ao DUNES)
EOSIO_PRIV="5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3"
EOSIO_PUB="EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV"

WALLET_NAME="devwallet"

ACCOUNT_NAMES=(
    orng.wax
    bingo.game
    alien.worlds
    microservice
    jogador1
    jogador2
    gameadmin11
    contractad1
    sponsor1111
)

# ──────────────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────────────

# Executa cleos dentro do container com path explícito
cleos() {
    docker exec "$CONTAINER_NAME" \
        "$WAX_BIN/cleos" --url http://127.0.0.1:8888 --wallet-url http://127.0.0.1:8900 "$@"
}

# Upsert de variável em arquivo .env
_upsert_env() {
    local file=$1 key=$2 value=$3
    mkdir -p "$(dirname "$file")"
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

# Aguarda nodeos responder (curl está disponível na imagem)
wait_nodeos() {
    echo "[*] Aguardando nodeos ficar disponível na porta $NODEOS_PORT..."
    local max=60 count=0
    until docker exec "$CONTAINER_NAME" \
        curl -sf http://127.0.0.1:8888/v1/chain/get_info > /dev/null 2>&1; do
        count=$((count + 1))
        if [ "$count" -ge "$max" ]; then
            echo ""
            echo "[!] Timeout aguardando nodeos. Últimas linhas do log:"
            docker exec "$CONTAINER_NAME" tail -30 /root/nodeos.log 2>/dev/null || true
            exit 1
        fi
        printf "."
        sleep 2
    done
    echo " OK"
}

# Aguarda keosd responder
wait_keosd() {
    echo "[*] Aguardando keosd ficar disponível..."
    local max=20 count=0
    until docker exec "$CONTAINER_NAME" \
        curl -sf http://127.0.0.1:8900/v1/wallet/list_wallets > /dev/null 2>&1; do
        count=$((count + 1))
        if [ "$count" -ge "$max" ]; then
            echo ""
            echo "[!] Timeout aguardando keosd."
            docker exec "$CONTAINER_NAME" tail -10 /root/keosd.log 2>/dev/null || true
            exit 1
        fi
        printf "."
        sleep 1
    done
    echo " OK"
}

# ──────────────────────────────────────────────────────────────────────────────
# MODO --envs
# ──────────────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--envs" ]]; then
    echo "[*] Modo --envs: apenas propagando variáveis..."
    if [ ! -f ".waxdev.env" ]; then
        echo "[!] .waxdev.env não encontrado. Execute sem --envs primeiro."
        exit 1
    fi
    source .waxdev.env
    SKIP_BLOCKCHAIN=true
fi

# ──────────────────────────────────────────────────────────────────────────────
# MODO --reset
# ──────────────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--reset" ]]; then
    echo "[*] Reset: removendo container $CONTAINER_NAME..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm   "$CONTAINER_NAME" 2>/dev/null || true
    rm -f .waxdev.env
    echo "[*] Container removido. Recriando..."
fi

# ──────────────────────────────────────────────────────────────────────────────
# 1. SOBE O CONTAINER
# ──────────────────────────────────────────────────────────────────────────────
if [[ "${SKIP_BLOCKCHAIN:-false}" != "true" ]]; then

echo ""
echo "════════════════════════════════════════════════"
echo " CryptoBingo — Bootstrap waxteam/waxdev"
echo "════════════════════════════════════════════════"
echo ""

# Cria rede se não existir
if ! docker network ls --format '{{.Name}}' | grep -qx 'cryptobingo-infra_bingo_net'; then
    echo "[*] Criando rede cryptobingo-infra_bingo_net..."
    docker network create cryptobingo-infra_bingo_net 2>/dev/null || true
fi

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "[*] Container $CONTAINER_NAME já está rodando."
elif docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "[*] Reiniciando container parado..."
    docker start "$CONTAINER_NAME"
else
    echo "[*] Criando container $CONTAINER_NAME..."
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "${NODEOS_PORT}:8888" \
        -p "8900:8900" \
        -v "$(pwd)/contracts:/app/contracts:ro" \
        --network cryptobingo-infra_bingo_net \
        "$WAXDEV_IMAGE" \
        tail -f /dev/null
fi

# ──────────────────────────────────────────────────────────────────────────────
# 2. INICIA KEOSD (com path explícito)
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Iniciando keosd..."
docker exec -d "$CONTAINER_NAME" bash -c "
    mkdir -p ${WALLET_DIR}
    ${WAX_BIN}/keosd \
        --wallet-dir ${WALLET_DIR} \
        --http-server-address 127.0.0.1:8900 \
        --http-validate-host=false \
        >> /root/keosd.log 2>&1
"
wait_keosd

# ──────────────────────────────────────────────────────────────────────────────
# 3. INICIA NODEOS (com path explícito e plugins corretos para WAX v5)
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Iniciando nodeos..."
docker exec -d "$CONTAINER_NAME" bash -c "
    mkdir -p ${DATA_DIR}
    ${WAX_BIN}/nodeos \
        -e -p eosio \
        --data-dir ${DATA_DIR} \
        --config-dir ${DATA_DIR} \
        --plugin eosio::chain_plugin \
        --plugin eosio::chain_api_plugin \
        --plugin eosio::net_plugin \
        --plugin eosio::net_api_plugin \
        --plugin eosio::producer_plugin \
        --plugin eosio::producer_api_plugin \
        --plugin eosio::http_plugin \
        --http-server-address 0.0.0.0:8888 \
        --access-control-allow-origin='*' \
        --contracts-console \
        --http-validate-host=false \
        --verbose-http-errors \
        --max-irreversible-block-age=-1 \
        >> /root/nodeos.log 2>&1
"
wait_nodeos

# ──────────────────────────────────────────────────────────────────────────────
# 4. CONFIGURA WALLET
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Configurando wallet dev..."

# Tenta desbloquear wallet existente (senha vazia: wallet nova/nunca bloqueada)
docker exec "$CONTAINER_NAME" \
    "$WAX_BIN/cleos" --wallet-url http://127.0.0.1:8900 \
    wallet unlock -n "$WALLET_NAME" --password "" 2>/dev/null || true

# Tenta desbloquear com senha salva (re-execução)
if [ -f ".wallet_password.tmp" ]; then
    SAVED_PW=$(cat .wallet_password.tmp)
    docker exec "$CONTAINER_NAME" \
        "$WAX_BIN/cleos" --wallet-url http://127.0.0.1:8900 \
        wallet unlock -n "$WALLET_NAME" --password "$SAVED_PW" 2>/dev/null || true
fi

# Cria nova wallet (falha silenciosamente se já existe)
WALLET_PW=$(docker exec "$CONTAINER_NAME" \
    "$WAX_BIN/cleos" --wallet-url http://127.0.0.1:8900 \
    wallet create -n "$WALLET_NAME" --to-console 2>/dev/null | \
    grep -E '^"PW' | tr -d '"' || true)

# Salva senha apenas se foi gerada agora
if [ -n "${WALLET_PW:-}" ]; then
    echo "$WALLET_PW" > .wallet_password.tmp
fi

# Importa chave eosio
docker exec "$CONTAINER_NAME" \
    "$WAX_BIN/cleos" \
    --url http://127.0.0.1:8888 \
    --wallet-url http://127.0.0.1:8900 \
    wallet import -n "$WALLET_NAME" \
    --private-key "$EOSIO_PRIV" 2>/dev/null || true

echo "[*] Wallet pronta."

# ──────────────────────────────────────────────────────────────────────────────
# 5. BOOTSTRAP DOS CONTRATOS DO SISTEMA
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Localizando contratos de sistema na imagem..."

# Contratos de token/msig/system ficam em unittests/contracts
# eosio.bios fica em libraries/testing/contracts (diretórios diferentes)
SYSTEM_CONTRACTS=""
BIOS_CONTRACTS=""

for candidate in \
    "/tmp/wax-blockchain/build/unittests/contracts" \
    "/tmp/wax-blockchain/unittests/contracts" \
    "/tmp/wax-blockchain/build/libraries/testing/contracts" \
    "/tmp/wax-blockchain/libraries/testing/contracts" \
    "/usr/share/eosio/contracts" \
    "/usr/local/share/eosio/contracts" \
    "/opt/eosio/bin/data-dir/contracts"
do
    if docker exec "$CONTAINER_NAME" \
        test -f "${candidate}/eosio.token/eosio.token.wasm" 2>/dev/null; then
        SYSTEM_CONTRACTS="$candidate"
        echo "[✓] Contratos de token/msig/system em: $SYSTEM_CONTRACTS"
        break
    fi
done

# Fallback: busca dinâmica (exclui old_versions)
if [ -z "$SYSTEM_CONTRACTS" ]; then
    echo "[*] Buscando eosio.token.wasm na imagem..."
    TOKEN_WASM=$(docker exec "$CONTAINER_NAME" bash -c \
        "find /tmp /usr /opt -path '*/eosio.token/eosio.token.wasm' ! -path '*/old_versions/*' 2>/dev/null | head -1" 2>/dev/null || true)
    if [ -z "$TOKEN_WASM" ]; then
        echo "[!] ERRO: eosio.token.wasm não encontrado na imagem."
        exit 1
    fi
    SYSTEM_CONTRACTS=$(dirname "$TOKEN_WASM" | sed 's|/eosio\.token$||')
    echo "[✓] Contratos encontrados via busca em: $SYSTEM_CONTRACTS"
fi

# Localiza eosio.bios separadamente
for candidate in \
    "/tmp/wax-blockchain/build/libraries/testing/contracts" \
    "/tmp/wax-blockchain/libraries/testing/contracts" \
    "$SYSTEM_CONTRACTS"
do
    if docker exec "$CONTAINER_NAME" \
        test -f "${candidate}/eosio.bios/eosio.bios.wasm" 2>/dev/null; then
        BIOS_CONTRACTS="$candidate"
        echo "[✓] eosio.bios encontrado em: $BIOS_CONTRACTS"
        break
    fi
done

if [ -z "$BIOS_CONTRACTS" ]; then
    echo "[*] Buscando eosio.bios.wasm (excluindo old_versions)..."
    BIOS_WASM=$(docker exec "$CONTAINER_NAME" bash -c \
        "find /tmp /usr /opt -path '*/eosio.bios/eosio.bios.wasm' ! -path '*/old_versions/*' 2>/dev/null | head -1" 2>/dev/null || true)
    if [ -z "$BIOS_WASM" ]; then
        echo "[!] ERRO: eosio.bios.wasm não encontrado na imagem."
        exit 1
    fi
    BIOS_CONTRACTS=$(dirname "$BIOS_WASM" | sed 's|/eosio\.bios$||')
    echo "[✓] eosio.bios encontrado via busca em: $BIOS_CONTRACTS"
fi

echo "[*] Bootstrap dos contratos de sistema..."

# eosio.bios (pode falhar se a imagem tiver contratos antigos — opcional em dev)
cleos set contract eosio "${BIOS_CONTRACTS}/eosio.bios" -p eosio@active 2>/dev/null || \
    echo "[!] Aviso: eosio.bios não pôde ser deployado (versão incompatível). Seguindo sem ele."

# eosio.token
cleos create account eosio eosio.token "$EOSIO_PUB" 2>/dev/null || true
cleos set contract eosio.token "${SYSTEM_CONTRACTS}/eosio.token" -p eosio.token@active

# Token WAX
cleos push action eosio.token create \
    '["eosio", "1000000000000.0000 WAX"]' -p eosio.token@active 2>/dev/null || true
cleos push action eosio.token issue \
    '["eosio", "1000000000000.0000 WAX", "Initial WAX supply"]' -p eosio@active 2>/dev/null || true

# eosio.msig (necessário para algumas operações de sistema)
cleos create account eosio eosio.msig "$EOSIO_PUB" 2>/dev/null || true
if docker exec "$CONTAINER_NAME" test -d "${SYSTEM_CONTRACTS}/eosio.msig" 2>/dev/null; then
    cleos set contract eosio.msig "${SYSTEM_CONTRACTS}/eosio.msig" -p eosio.msig@active 2>/dev/null || true
fi

# eosio.system é propositalmente deixado de lado aqui pois ele intercepta
# a ação newaccount e exige init() com o symbol core, o que quebraria a
# criação de contas que vem a seguir. Se precisar dele em dev:
#   cleos set contract eosio ${SYSTEM_CONTRACTS}/eosio.system -p eosio@active
#   cleos push action eosio init '["4,WAX"]' -p eosio@active

echo "[✓] Bootstrap de sistema concluído."

# ──────────────────────────────────────────────────────────────────────────────
# 6. CRIA CONTAS DE DESENVOLVIMENTO
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Criando contas de desenvolvimento..."

# Inicializa .waxdev.env
cat > .waxdev.env << 'ENVEOF'
# .waxdev.env — Chaves do ambiente blockchain local
# Gerado por init_dev_env.sh — NÃO COMMITAR
ENVEOF
echo "EOSIO_KEY=$EOSIO_PRIV" >> .waxdev.env

create_managed_account() {
    local name=$1
    echo "[*] Criando conta: $name"

    local keys priv pub
    keys=$(docker exec "$CONTAINER_NAME" \
        "$WAX_BIN/cleos" --wallet-url http://127.0.0.1:8900 \
        create key --to-console 2>/dev/null)

    priv=$(echo "$keys" | grep "Private key:" | awk '{print $3}')
    pub=$(echo  "$keys" | grep "Public key:"  | awk '{print $3}')

    if [ -z "$priv" ] || [ -z "$pub" ]; then
        echo "[!] Falha ao gerar chave para $name"
        return 1
    fi

    # Importa na wallet
    docker exec "$CONTAINER_NAME" \
        "$WAX_BIN/cleos" \
        --url http://127.0.0.1:8888 \
        --wallet-url http://127.0.0.1:8900 \
        wallet import -n "$WALLET_NAME" --private-key "$priv" 2>/dev/null || true

    # Tenta criar com staking (eosio.system ativo), senão cria simples
    cleos system newaccount eosio "$name" "$pub" \
        --stake-net "1000.0000 WAX" \
        --stake-cpu "1000.0000 WAX" \
        --buy-ram-bytes 8192000 \
        -p eosio@active 2>/dev/null || \
    cleos create account eosio "$name" "$pub" -p eosio@active 2>/dev/null || true

    local var_name
    var_name=$(echo "$name" | tr '.' '_' | tr '[:lower:]' '[:upper:]')
    echo "${var_name}_KEY=$priv" >> .waxdev.env
    echo "${var_name}_PUB=$pub"  >> .waxdev.env
}

for acc in "${ACCOUNT_NAMES[@]}"; do
    create_managed_account "$acc" || true
done

# ──────────────────────────────────────────────────────────────────────────────
# 7. TOKEN BINGO
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Criando token BINGO..."

BT_KEYS=$(docker exec "$CONTAINER_NAME" \
    "$WAX_BIN/cleos" --wallet-url http://127.0.0.1:8900 \
    create key --to-console 2>/dev/null)
BT_PRIV=$(echo "$BT_KEYS" | grep "Private key:" | awk '{print $3}')
BT_PUB=$(echo  "$BT_KEYS" | grep "Public key:"  | awk '{print $3}')

docker exec "$CONTAINER_NAME" \
    "$WAX_BIN/cleos" --url http://127.0.0.1:8888 --wallet-url http://127.0.0.1:8900 \
    wallet import -n "$WALLET_NAME" --private-key "$BT_PRIV" 2>/dev/null || true

cleos system newaccount eosio bingo.token "$BT_PUB" \
    --stake-net "1000.0000 WAX" --stake-cpu "1000.0000 WAX" \
    --buy-ram-bytes 8192000 -p eosio@active 2>/dev/null || \
cleos create account eosio bingo.token "$BT_PUB" -p eosio@active 2>/dev/null || true

echo "BINGO_TOKEN_KEY=$BT_PRIV" >> .waxdev.env
echo "BINGO_TOKEN_PUB=$BT_PUB"  >> .waxdev.env

cleos set contract bingo.token "${SYSTEM_CONTRACTS}/eosio.token" -p bingo.token@active

cleos push action bingo.token create \
    '["bingo.game", "1000000000.0000 BINGO"]' -p bingo.token@active 2>/dev/null || true
cleos push action bingo.token issue \
    '["bingo.game", "500000000.0000 BINGO", "Emissao Inicial CryptoBingo"]' \
    -p bingo.game@active 2>/dev/null || true

echo "[*] Distribuindo BINGO..."
for dest in microservice jogador1 jogador2 gameadmin11 contractad1 sponsor1111; do
    cleos push action bingo.token open \
        "[\"$dest\", \"4,BINGO\", \"bingo.game\"]" \
        -p bingo.game@active > /dev/null 2>&1 || true
    cleos push action bingo.token transfer \
        "[\"bingo.game\", \"$dest\", \"10000.0000 BINGO\", \"Dev tokens\"]" \
        -p bingo.game@active 2>/dev/null || true
done

echo "[*] Distribuindo WAX para contas de desenvolvimento..."
for dest in bingo.game bingo.token microservice jogador1 jogador2 gameadmin11 contractad1 sponsor1111; do
    cleos push action eosio.token transfer \
        "[\"eosio\", \"$dest\", \"100000.0000 WAX\", \"Dev WAX\"]" \
        -p eosio@active 2>/dev/null || true
done

# ──────────────────────────────────────────────────────────────────────────────
# 8. DEPLOY DO CONTRATO bingo.game
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Deploy do contrato bingo.game..."
if [ -f "${CONTRACT_SRC_HOST}/bingo.wasm" ] && [ -f "${CONTRACT_SRC_HOST}/bingo.abi" ]; then
    if cleos set contract bingo.game "$CONTRACT_SRC_CONTAINER" -p bingo.game@active; then
        cleos set account permission bingo.game active --add-code -p bingo.game@active 2>/dev/null || true
        echo "[✓] bingo.game deployado."
    else
        echo "[!] Aviso: deploy do bingo.game falhou (WASM pode ter nomes inválidos)."
    fi
else
    echo "[!] bingo.wasm/bingo.abi não encontrados em ${CONTRACT_SRC_HOST}"
    echo "    Compile o contrato e execute novamente ou:"
    echo "    cleos set contract bingo.game $CONTRACT_SRC_CONTAINER -p bingo.game@active"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 8b. DEPLOY DO ORÁCULO MOCK (orng.wax)
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Deploy do oráculo mock (orng.wax)..."
if [ -f "$(pwd)/contracts/orng_mock.wasm" ] && [ -f "$(pwd)/contracts/orng_mock.abi" ]; then
    cleos set code orng.wax /app/contracts/orng_mock.wasm -p orng.wax@active
    cleos set abi orng.wax /app/contracts/orng_mock.abi -p orng.wax@active
    cleos set account permission orng.wax active --add-code -p orng.wax@active 2>/dev/null || true
    echo "[✓] orng_mock deployado em orng.wax."
else
    echo "[!] orng_mock.wasm/orng_mock.abi não encontrados em contracts/"
    echo "    Compile o mock: cdt-cpp contracts/bingo/src/orng_mock.cpp -o contracts/orng_mock.wasm"
fi

# ──────────────────────────────────────────────────────────────────────────────
# 8c. CONFIGURA signer_key DO CONTRATO
# ──────────────────────────────────────────────────────────────────────────────
source .waxdev.env
echo "[*] Configurando signer_key do contrato bingo.game..."
cleos push action bingo.game setconfig \
    "{\"signer_key\": \"${BINGO_GAME_PUB}\"}" \
    -p bingo.game@active || \
    echo "[!] Aviso: setconfig falhou (pode executar manualmente depois)."

# ──────────────────────────────────────────────────────────────────────────────
# 9. CAPTURA CHAIN_ID
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Capturando Chain ID..."
CHAIN_ID=$(docker exec "$CONTAINER_NAME" \
    curl -s http://127.0.0.1:8888/v1/chain/get_info 2>/dev/null | \
    grep -o '"chain_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CHAIN_ID" ]; then
    echo "[!] Não foi possível obter o chain_id. Usando fallback."
    CHAIN_ID="8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f"
fi

echo "CHAIN_ID=$CHAIN_ID"          >> .waxdev.env
echo "RPC_URL=http://127.0.0.1:8888" >> .waxdev.env
echo "CONTAINER_NAME=$CONTAINER_NAME" >> .waxdev.env
echo "[✓] Chain ID: $CHAIN_ID"

fi # fim SKIP_BLOCKCHAIN

# ──────────────────────────────────────────────────────────────────────────────
# 10. PROPAGA .waxdev.env → .env DOS APPS
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "[*] Propagando variáveis para .env dos apps..."
source .waxdev.env

F="apps/frontend/.env"
_upsert_env "$F" "VITE_CHAIN_ID"                "$CHAIN_ID"
_upsert_env "$F" "VITE_RPC_URL"                 "http://127.0.0.1:8888"
_upsert_env "$F" "VITE_API_GATEWAY_URL"          "http://localhost:8083"
_upsert_env "$F" "VITE_CONTRACT_ACCOUNT"         "bingo.game"
_upsert_env "$F" "VITE_EXPLORER_URL"             "https://wax.bloks.io"
_upsert_env "$F" "VITE_WS_URL"                   ""
_upsert_env "$F" "VITE_WS_URL_INTERNAL"          "http://127.0.0.1:8085"
_upsert_env "$F" "VITE_DEV_SESSION"              "true"
_upsert_env "$F" "VITE_DEV_ACTOR"                "jogador1"
_upsert_env "$F" "VITE_DEV_PRIVATE_KEY"          "${JOGADOR1_KEY:-}"
_upsert_env "$F" "VITE_DEV_ACTOR_JOGADOR2"       "jogador2"
_upsert_env "$F" "VITE_DEV_KEY_JOGADOR2"         "${JOGADOR2_KEY:-}"
_upsert_env "$F" "VITE_DEV_ACTOR_GAME_ADMIN"     "gameadmin11"
_upsert_env "$F" "VITE_DEV_KEY_GAME_ADMIN"       "${GAMEADMIN11_KEY:-}"
_upsert_env "$F" "VITE_DEV_ACTOR_CONTRACT_ADMIN" "contractad1"
_upsert_env "$F" "VITE_DEV_KEY_CONTRACT_ADMIN"   "${CONTRACTAD1_KEY:-}"
_upsert_env "$F" "VITE_DEV_ACTOR_SPONSOR"        "sponsor1111"
_upsert_env "$F" "VITE_DEV_KEY_SPONSOR"          "${SPONSOR1111_KEY:-}"

F="apps/api-gateway/.env"
if grep -q "^JWT_SECRET=" "$F" 2>/dev/null; then
    JWT_SECRET=$(grep "^JWT_SECRET=" "$F" | head -1 | cut -d= -f2-)
else
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "dev_jwt_secret_change_in_production")
fi
_upsert_env "$F" "PORT"                     "8083"
_upsert_env "$F" "CHAIN_ID"                 "$CHAIN_ID"
_upsert_env "$F" "RPC_URL"                  "http://127.0.0.1:8888"
_upsert_env "$F" "POSTGRES_URL"             "postgres://bingo_admin:bingo_secure_pass_2026@localhost:5432/cryptobingo_ledger"
_upsert_env "$F" "MONGO_URL"                "mongodb://mongo_admin:mongo_secure_pass_2026@localhost:27017/cryptobingo_edge?authSource=admin"
_upsert_env "$F" "REDIS_URL"                "redis://localhost:6379"
_upsert_env "$F" "CONTRACT_ACCOUNT"         "bingo.game"
_upsert_env "$F" "MICROSERVICE_PRIVATE_KEY" "${BINGO_GAME_KEY:-}"
_upsert_env "$F" "CONTRACT_PRIVATE_KEY"     "${BINGO_GAME_KEY:-}"
_upsert_env "$F" "JWT_SECRET"               "$JWT_SECRET"
_upsert_env "$F" "ALLOWED_ORIGINS"          "http://localhost:5173,http://localhost:3000"
_upsert_env "$F" "VERIFY_KEY_ONCHAIN"       "false"

F="apps/worker-game-loop/.env"
_upsert_env "$F" "CHAIN_ID"                 "$CHAIN_ID"
_upsert_env "$F" "RPC_URL"                  "http://127.0.0.1:8888"
_upsert_env "$F" "CONTRACT_ACCOUNT"         "bingo.game"
_upsert_env "$F" "MICROSERVICE_PRIVATE_KEY" "${MICROSERVICE_KEY:-}"
_upsert_env "$F" "CONTRACT_PRIVATE_KEY"     "${BINGO_GAME_KEY:-}"
_upsert_env "$F" "POSTGRES_URL"             "postgres://bingo_admin:bingo_secure_pass_2026@localhost:5432/cryptobingo_ledger"
_upsert_env "$F" "REDIS_URL"                "redis://localhost:6379"
_upsert_env "$F" "RABBITMQ_URL"             "amqp://rabbit_admin:rabbit_secure_pass_2026@localhost:5672"
_upsert_env "$F" "RABBITMQ_MAX_RETRIES"     "3"
_upsert_env "$F" "JWT_SECRET"               "$JWT_SECRET"
_upsert_env "$F" "WS_PORT"                  "8085"
_upsert_env "$F" "REVEAL_INTERVAL"          "3000"
_upsert_env "$F" "WS_MAX_CONNECTIONS_PER_IP" "10"
_upsert_env "$F" "ALLOWED_ORIGIN"           "http://localhost:5173"
_upsert_env "$F" "METRICS_PORT"             "9091"
_upsert_env "$F" "INDEXER_INTERVAL_MS"      "15000"

_upsert_env ".env" "EOSIO_KEY"              "$EOSIO_PRIV"
_upsert_env ".env" "CHAIN_ID"               "$CHAIN_ID"
_upsert_env ".env" "RPC_URL"                "http://host.docker.internal:8888"
_upsert_env ".env" "MONGO_INITDB_ROOT_USERNAME" "mongo_admin"
_upsert_env ".env" "MONGO_INITDB_ROOT_PASSWORD" "mongo_secure_pass_2026"
_upsert_env ".env" "POSTGRES_USER"          "bingo_admin"
_upsert_env ".env" "POSTGRES_DB"            "cryptobingo_ledger"
_upsert_env ".env" "VITE_CHAIN_ID"          "$CHAIN_ID"
_upsert_env ".env" "VITE_RPC_URL"           "http://127.0.0.1:8888"
_upsert_env ".env" "VITE_API_GATEWAY_URL"   "http://localhost:8083"
_upsert_env ".env" "VITE_WS_URL"            "http://localhost:8085"
_upsert_env ".env" "VITE_CONTRACT_ACCOUNT"  "bingo.game"

sed -i "s|^RPC_URL=.*|RPC_URL=http://${CONTAINER_NAME}:8888|" .env.infra 2>/dev/null || \
    echo "RPC_URL=http://${CONTAINER_NAME}:8888" >> .env.infra
sed -i "s|^CHAIN_ID=.*|CHAIN_ID=${CHAIN_ID}|" .env.infra 2>/dev/null || \
    echo "CHAIN_ID=${CHAIN_ID}" >> .env.infra

# ──────────────────────────────────────────────────────────────────────────────
# 11. CONECTA À REDE DA COMPOSE (se existir)
# ──────────────────────────────────────────────────────────────────────────────
if docker network ls --format '{{.Name}}' | grep -qx 'cryptobingo-infra_bingo_net'; then
    echo "[*] Conectando $CONTAINER_NAME à rede bingo_net..."
    docker network connect cryptobingo-infra_bingo_net "$CONTAINER_NAME" 2>/dev/null || true

    if docker ps --format '{{.Names}}' | grep -q 'bingo_mongodb'; then
        echo "[*] Promovendo contas admin no MongoDB..."
        docker exec bingo_mongodb mongosh \
            --username mongo_admin --password mongo_secure_pass_2026 \
            --authenticationDatabase admin cryptobingo_edge \
            --eval 'db.userprofiles.updateMany(
                {wallet_address:{$in:["gameadmin11","contractad1"]}},
                {$set:{role:"admin"}}
            )' 2>/dev/null || true

        echo "[*] Promovendo conta sponsor no MongoDB..."
        docker exec bingo_mongodb mongosh \
            --username mongo_admin --password mongo_secure_pass_2026 \
            --authenticationDatabase admin cryptobingo_edge \
            --eval 'db.userprofiles.updateMany(
                {wallet_address:{$in:["sponsor1111"]}},
                {$set:{role:"sponsor"}}
            )' 2>/dev/null || true
    fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# 12. .dev.env AGREGADO
# ──────────────────────────────────────────────────────────────────────────────
echo "[*] Gerando .dev.env..."
{
    echo "# ================================================================"
    echo "# .dev.env — Agregado completo — gerado em $(date +%Y-%m-%d)"
    echo "# !! CONTÉM CHAVES PRIVADAS — NUNCA COMMITAR !!"
    echo "# ================================================================"
    echo ""
    echo "# ── Blockchain ──────────────────────────────────────────────────"
    grep -v '^#' ".waxdev.env"            2>/dev/null | grep -v '^$' || true
    echo ""
    echo "# ── Root ────────────────────────────────────────────────────────"
    grep -v '^#' ".env"                   2>/dev/null | grep -v '^$' || true
    echo ""
    echo "# ── Frontend ────────────────────────────────────────────────────"
    grep -v '^#' "apps/frontend/.env"     2>/dev/null | grep -v '^$' || true
    echo ""
    echo "# ── API Gateway ─────────────────────────────────────────────────"
    grep -v '^#' "apps/api-gateway/.env"  2>/dev/null | grep -v '^$' || true
    echo ""
    echo "# ── Worker ──────────────────────────────────────────────────────"
    grep -v '^#' "apps/worker-game-loop/.env" 2>/dev/null | grep -v '^$' || true
} > .dev.env

echo ""
echo "════════════════════════════════════════════════"
echo "✅ Ambiente CryptoBingo pronto!"
echo "════════════════════════════════════════════════"
echo ""
echo "  Container : $CONTAINER_NAME"
echo "  RPC       : http://127.0.0.1:${NODEOS_PORT}"
echo "  Chain ID  : ${CHAIN_ID:-desconhecido}"
echo ""
echo "  Próximos passos:"
echo "    docker compose up -d"
echo "    pnpm dev"
echo ""
echo "  Úteis:"
echo "    Logs nodeos : docker exec $CONTAINER_NAME tail -f /root/nodeos.log"
echo "    Shell       : docker exec -it $CONTAINER_NAME bash"
echo "    Reset       : bash init_dev_env.sh --reset"
echo "    Só .env     : bash init_dev_env.sh --envs"
echo ""
