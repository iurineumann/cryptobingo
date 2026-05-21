#!/bin/bash
# Script de Reset e Provisionamento: init_env.sh

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

# Função para criar conta e salvar chave
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
for acc in orng.wax bingo.game alien.worlds jogador1 jogador2; do
    create_managed_account $acc
    dune --import-dev-key $PRIV
done

echo "[*] Finalizando configurações..."
CHAIN_ID=$(curl -s http://127.0.0.1:8888/v1/chain/get_info | jq -r '.chain_id')
echo "CHAIN_ID=$CHAIN_ID" >> .dune.env
echo "RPC_URL=http://127.0.0.1:8888" >> .dune.env

echo "✅ Ambiente pronto! Chaves salvas em .dune.env"