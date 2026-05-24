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
        std::vector<char> drawn_balls;
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
    typedef multi_index<"tickets"_n, ticket_record> tickets_table;

    // Tabela dinâmica para gerir os poderes das NFTs
    struct [[eosio::table("nftconfigs")]] nft_config {
        int32_t  template_id;
        uint8_t  discount_pct; // Ex: 10 para 10%
        bool     is_vip;
        uint32_t valid_until;
        uint64_t primary_key() const { return (uint64_t)template_id; }
    };
    typedef multi_index<"nftconfigs"_n, nft_config> nftconfigs_table;

    // Espelho da tabela do AtomicAssets para leitura de posse
    struct asset_s {
        uint64_t         asset_id;
        name             collection_name;
        name             schema_name;
        int32_t          template_id;
        name             ram_payer;
        std::vector<asset> backed_tokens;
        std::vector<uint8_t> immutable_serialized_data;
        std::vector<uint8_t> mutable_serialized_data;
        uint64_t primary_key() const { return asset_id; }
    };
    typedef multi_index<"assets"_n, asset_s> atomic_assets_table;

    class [[eosio::contract("bingo")]] bingo_contract : public contract {
    public:
        using contract::contract;

        [[eosio::action]] void setconfig(public_key signer_key);
        [[eosio::action]] void creategame(uint64_t game_id, extended_asset ticket_price);
        
        // Ações de Gestão de NFT
        [[eosio::action]] void setnftconf(int32_t template_id, uint8_t discount_pct, bool is_vip, uint32_t valid_until);
        [[eosio::action]] void delnftconf(int32_t template_id);

        // Core do Jogo
        [[eosio::action]] void buytickets(name buyer, uint64_t game_id, std::vector<std::vector<char>> matrices, std::vector<signature> signatures, uint64_t nft_id);
        [[eosio::action]] void lockgame(uint64_t game_id);
        [[eosio::action]] void startdraw(uint64_t game_id);
        [[eosio::action]] void receiverand(uint64_t assoc_id, std::vector<char> random_bytes);
        [[eosio::action]] void claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask);
        
        // Economia
        [[eosio::action]] void withdraw(name owner, extended_asset amount);
        [[eosio::on_notify("*::transfer")]] void deposit(name from, name to, eosio::asset quantity, std::string memo);
    };
}