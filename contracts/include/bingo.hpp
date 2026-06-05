#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/extended_asset.hpp>
#include <eosio/singleton.hpp>

namespace bingo {
    using namespace eosio;

    // Tabela de Balanço: Cada conta possui N registros de tokens diferentes
    struct [[eosio::table]] balance_record {
        extended_asset balance;
        uint64_t primary_key() const { return balance.get_extended_symbol().get_symbol().raw(); }
    };
    typedef multi_index<"balances"_n, balance_record> balances_table;

    struct [[eosio::table]] game_state {
        uint64_t game_id;
        name status; // 'created', 'funding', 'locked', 'drawing', 'archived', 'aborted'
        extended_asset ticket_price;
        extended_asset total_wagered;
        std::vector<extended_asset> sponsor_pool;
        std::vector<uint8_t> drawn_balls;
        uint64_t primary_key() const { return game_id; }
    };
    typedef multi_index<"games"_n, game_state> games_table;

    struct [[eosio::table]] ticket_record {
        uint64_t ticket_id;
        name owner;
        std::vector<uint8_t> matrix;
        uint32_t state; // Bitmask
        uint64_t game_id;

        uint64_t primary_key() const { return ticket_id; }
        uint64_t get_owner() const { return owner.value; }
    };
    typedef multi_index<"tickets"_n, ticket_record, 
        indexed_by<"owner"_n, const_mem_fun<ticket_record, uint64_t, &ticket_record::get_owner>>
    > tickets_table;

    class [[eosio::contract("bingo")]] bingo_contract : public contract {
    public:
        using contract::contract;

        // Implementação conforme ADR-001: Assinatura Contextual
        // A assinatura deve validar hash(matrix + game_id + owner)
        [[eosio::action]]
        void buytickets(name owner, uint64_t game_id, std::vector<std::vector<uint8_t>> matrices, std::vector<signature> signatures);

        [[eosio::action]]
        void lockgame(uint64_t game_id);

    private:
        // Helper para checagem de autorização e assinaturas
    };
}