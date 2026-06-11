#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include <eosio/system.hpp>
#include <vector>
#include <string>

namespace swap_contract_ns {
    using namespace eosio;

    // ==========================================
    // ESTADO GLOBAL
    // ==========================================

    struct [[eosio::table("swapstate")]] swap_state {
        uint64_t next_pool_id  = 1;
        uint64_t next_token_id = 1;   // contador da allowlist
        name     treasury      = "bingogamectr"_n; // destino das service fees (settreasury)
    };
    typedef singleton<"swapstate"_n, swap_state> swap_state_singleton;

    // ==========================================
    // ALLOWLIST DE TOKENS APROVADOS
    // Apenas o próprio contrato (get_self()) pode adicionar/remover entradas.
    // createpool valida ambos os tokens contra esta tabela — previne fake-token injection.
    // Índice secundário: (contract.value << 64) | symbol_code.raw() → lookup O(log n).
    // ==========================================

    struct [[eosio::table("allowedtoks")]] allowed_token {
        uint64_t        id;
        extended_symbol sym;

        uint64_t  primary_key() const { return id; }
        uint128_t by_sym()      const {
            return ((uint128_t)sym.get_contract().value << 64)
                 |  (uint64_t)sym.get_symbol().code().raw();
        }
    };
    typedef multi_index<
        "allowedtoks"_n,
        allowed_token,
        indexed_by<"bysym"_n, const_mem_fun<allowed_token, uint128_t, &allowed_token::by_sym>>
    > allowed_tokens_table;

    // ==========================================
    // POOLS AMM (x*y=k)
    // ==========================================

    struct [[eosio::table("pools")]] pool_record {
        uint64_t        pool_id;
        extended_symbol sym_a;            // token com menor symbol_code.raw() (ordem canônica)
        extended_symbol sym_b;
        int64_t         reserve_a;        // reserva em unidades mínimas do token A
        int64_t         reserve_b;
        int64_t         lp_supply;        // total de LP tokens emitidos
        uint16_t        fee_bps;          // taxa LP em bps (30 = 0.30%) — fica no pool
        uint16_t        service_fee_bps;  // taxa de serviço em bps — vai para treasury

        uint64_t  primary_key() const { return pool_id; }
        uint128_t by_pair()     const {
            return ((uint128_t)sym_a.get_symbol().code().raw() << 64)
                 |  (uint64_t)sym_b.get_symbol().code().raw();
        }
    };
    typedef multi_index<
        "pools"_n,
        pool_record,
        indexed_by<"bypair"_n, const_mem_fun<pool_record, uint128_t, &pool_record::by_pair>>
    > pools_table;

    // ==========================================
    // DEPÓSITOS PENDENTES (scoped by account)
    // Uso: enviar ambos os tokens com memo "deposit,<pool_id>" e depois chamar addliq.
    // Expira em 10 min — canceldep devolve os saldos.
    // ==========================================

    struct [[eosio::table("pending")]] pending_deposit {
        uint64_t       pool_id;
        extended_asset deposit_a;   // quantidade.amount == 0 se ainda não depositado
        extended_asset deposit_b;
        uint32_t       expires_at;

        uint64_t primary_key() const { return pool_id; }
    };
    typedef multi_index<"pending"_n, pending_deposit> pending_table;

    // ==========================================
    // SALDOS LP (scoped by account)
    // ==========================================

    struct [[eosio::table("lpbalances")]] lp_balance {
        uint64_t pool_id;
        int64_t  amount;
        uint64_t primary_key() const { return pool_id; }
    };
    typedef multi_index<"lpbalances"_n, lp_balance> lp_balances_table;

    // ==========================================
    // CONTRACT
    // ==========================================

    class [[eosio::contract("swap")]] swap_contract : public contract {
    public:
        using contract::contract;

        // ── Configuração (admin-only) ────────────────────────────────────────────
        // Define a conta treasury que recebe as service fees. Default: bingogamectr.
        [[eosio::action]] void settreasury(name account);

        // Define a service_fee_bps do pool. Máximo: 500 (5%).
        // A service fee é deduzida do amount_in ANTES da fórmula AMM e enviada ao treasury.
        // Use 0 para desativar (campanhas de fee-zero).
        [[eosio::action]] void setpoolfee(uint64_t pool_id, uint16_t service_fee_bps);

        // ── Allowlist de tokens (admin-only) ────────────────────────────────────
        // Adiciona um token à allowlist. Requer auth do próprio contrato (get_self()).
        [[eosio::action]] void addtoken(extended_symbol sym);

        // Remove um token da allowlist. Pools existentes com este token não são afetados.
        [[eosio::action]] void deltoken(extended_symbol sym);

        // ── Pools ───────────────────────────────────────────────────────────────
        // Cria um novo pool AMM para um par de tokens.
        // Ambos os tokens devem estar previamente aprovados na allowlist.
        // Os tokens são ordenados canonicamente (menor symbol_code primeiro).
        // fee_bps: taxa LP em bps; padrão recomendado 30 (0.30%); máximo 1000 (10%).
        // service_fee_bps configurado separadamente via setpoolfee (default 0).
        [[eosio::action]] void createpool(
            name creator,
            extended_symbol sym_a,
            extended_symbol sym_b,
            uint16_t        fee_bps
        );

        // Adiciona liquidez consumindo os depósitos pendentes (deposit_a + deposit_b).
        // Deve ser chamado após enviar os dois tokens com memo "deposit,<pool_id>".
        // O excesso do token com maior proporção é devolvido automaticamente.
        [[eosio::action]] void addliq(name provider, uint64_t pool_id, int64_t min_lp);

        // Remove liquidez: queima lp_amount LP tokens e devolve ambos os tokens.
        [[eosio::action]] void remliq(
            name     provider,
            uint64_t pool_id,
            int64_t  lp_amount,
            int64_t  min_a,
            int64_t  min_b
        );

        // Cancela depósitos pendentes e devolve os tokens ao provider.
        [[eosio::action]] void canceldep(name provider, uint64_t pool_id);

        // Recebe tokens do sistema eosio::transfer.
        // Memo "deposit,<pool_id>"               → registra depósito pendente para addliq.
        // Memo "swap,<pool_id>,<min_out>,<to>"   → executa swap x*y=k imediato.
        [[eosio::on_notify("*::transfer")]]
        void on_transfer(name from, name to, asset quantity, std::string memo);

    private:
        pool_record              _get_pool(uint64_t pool_id);
        void                     _save_pool(pool_record& pool);
        bool                     _is_sym_a(const pool_record& pool, name contract, symbol sym) const;
        bool                     _is_allowed(extended_symbol sym) const;
        static int64_t           _isqrt(int128_t n);
        static int64_t           _compute_out(int64_t reserve_in, int64_t reserve_out,
                                               int64_t amount_in, uint16_t fee_bps);
        static std::vector<std::string> _split(const std::string& s, char delim);
    };
}
