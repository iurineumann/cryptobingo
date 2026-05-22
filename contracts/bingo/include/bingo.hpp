#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include <eosio/crypto.hpp>
#include <vector>

namespace bingo {
    using namespace eosio;

    struct [[eosio::table("config")]] config_state {
        public_key signer_key;
    };
    typedef singleton<"config"_n, config_state> config_singleton;

    struct [[eosio::table("balances")]] balance_record {
        extended_asset balance;
        uint64_t primary_key() const { return balance.quantity.symbol.code().raw(); }
    };
    typedef multi_index<"balances"_n, balance_record> balances_table;

    struct [[eosio::table("games")]] game_state {
        uint64_t game_id;
        name status; 
        extended_asset ticket_price;
        extended_asset prize_pool;
        std::vector<extended_asset> sponsor_pool;
        std::vector<char> drawn_balls; // <-- Alterado para 'char' para o gerador ABI (bytes)
        uint64_t primary_key() const { return game_id; }
    };
    typedef multi_index<"games"_n, game_state> games_table;

    struct [[eosio::table("tickets")]] ticket_record {
        uint64_t ticket_id;
        name owner;
        std::vector<char> matrix;
        uint32_t state; 
        uint64_t game_id;

        uint64_t primary_key() const { return ticket_id; }
    };
    // Tabela limpa, sem índices secundários complexos que travam o ABIGEN!
    typedef multi_index<"tickets"_n, ticket_record> tickets_table;

    class [[eosio::contract("bingo")]] bingo_contract : public contract {
    public:
        using contract::contract;

        [[eosio::action]]
        void setconfig(public_key signer_key);

        [[eosio::action]]
        void creategame(uint64_t game_id, extended_asset ticket_price);

        // Assinatura atualizada para std::vector<char>
        [[eosio::action]]
        void buytickets(name owner, uint64_t game_id, std::vector<std::vector<char>> matrices, std::vector<signature> signatures);

        [[eosio::action]]
        void lockgame(uint64_t game_id);

        [[eosio::action]]
        void startdraw(uint64_t game_id);

        [[eosio::action]]
        void claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask);

        [[eosio::action]]
        void withdraw(name owner, extended_asset amount);

        [[eosio::on_notify("eosio.token::transfer")]]
        void deposit(name from, name to, eosio::asset quantity, std::string memo);
    };
}