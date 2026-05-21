#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/extended_asset.hpp>
#include <eosio/singleton.hpp>
#include <eosio/crypto.hpp>

namespace bingo {
    using namespace eosio;

    struct [[eosio::table]] config_state {
        public_key signer_key;
    };
    typedef singleton<"config"_n, config_state> config_singleton;
    typedef multi_index<"config"_n, config_state> config_singleton_abi;

    struct [[eosio::table]] balance_record {
        extended_asset balance;
        uint64_t primary_key() const { return balance.get_extended_symbol().get_symbol().raw(); }
    };
    typedef multi_index<"balances"_n, balance_record> balances_table;

    struct [[eosio::table]] game_state {
        uint64_t game_id;
        name status; 
        extended_asset ticket_price;
        extended_asset prize_pool;
        std::vector<extended_asset> sponsor_pool;
        std::vector<uint8_t> drawn_balls;
        uint64_t primary_key() const { return game_id; }
    };
    typedef multi_index<"games"_n, game_state> games_table;

    struct [[eosio::table]] ticket_record {
        uint64_t ticket_id;
        name owner;
        std::vector<uint8_t> matrix;
        uint32_t state; 
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

        [[eosio::action]]
        void setconfig(public_key signer_key);

        [[eosio::action]]
        void buytickets(name owner, uint64_t game_id, std::vector<std::vector<uint8_t>> matrices, std::vector<signature> signatures);

        [[eosio::action]]
        void lockgame(uint64_t game_id);

        [[eosio::action]]
        void claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask);

    private:
        config_state get_config();
    };
}