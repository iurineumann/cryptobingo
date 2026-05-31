#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include <eosio/crypto.hpp>
#include <eosio/system.hpp>
#include <vector>
#include <string>

namespace bingo {
    using namespace eosio;

    // ==========================================
    // CONFIG
    // ==========================================

    struct [[eosio::table("config")]] config_state {
        public_key signer_key;
    };
    typedef singleton<"config"_n, config_state> config_singleton;

    // ==========================================
    // BALANCES
    // ==========================================

    struct [[eosio::table("balances")]] balance_record {
        extended_asset balance;
        uint64_t primary_key() const { return balance.quantity.symbol.code().raw(); }
    };
    typedef multi_index<"balances"_n, balance_record> balances_table;

    // ==========================================
    // GAMES
    // FSM: created → funding → locked → drawing → drawn → archived
    //                                ↘ aborted (fail-safe)
    // ==========================================

    struct [[eosio::table("games")]] game_state {
        uint64_t                    game_id;
        name                        status;
        extended_asset              ticket_price;
        extended_asset              prize_pool;
        std::vector<extended_asset> sponsor_pool;
        std::vector<char>           drawn_balls;
        uint64_t                    campaign_id  = 0;
        uint64_t                    gametype_id  = 0;
        uint64_t                    room_id      = 0;  // ADR-010: 0 = jogo avulso
        time_point_sec              end_time     = time_point_sec(0);

        uint64_t primary_key() const { return game_id; }
        uint64_t by_room()     const { return room_id; }
    };
    typedef multi_index<
        "games"_n,
        game_state,
        indexed_by<"byroom"_n, const_mem_fun<game_state, uint64_t, &game_state::by_room>>
    > games_table;

    // ==========================================
    // TICKETS
    // ==========================================

    struct [[eosio::table("tickets")]] ticket_record {
        uint64_t           ticket_id;
        name               owner;
        std::vector<char>  matrix;
        uint32_t           state;
        uint64_t           game_id;

        uint64_t primary_key()  const { return ticket_id; }
        uint64_t by_owner()     const { return owner.value; }
    };
    typedef multi_index<
        "tickets"_n,
        ticket_record,
        indexed_by<"byowner"_n, const_mem_fun<ticket_record, uint64_t, &ticket_record::by_owner>>
    > tickets_table;

    // ==========================================
    // NFT CONFIGS
    // ==========================================

    struct [[eosio::table("nftconfigs")]] nft_config {
        int32_t  template_id;
        uint8_t  discount_pct;
        bool     is_vip;
        uint32_t valid_until;
        uint64_t primary_key() const { return (uint64_t)template_id; }
    };
    typedef multi_index<"nftconfigs"_n, nft_config> nftconfigs_table;

    // ==========================================
    // CAMPAIGNS — Motor de Patrocínio B2B
    // ==========================================

    struct [[eosio::table("campaigns")]] campaign_record {
        uint64_t       campaign_id;
        name           sponsor;
        extended_asset total_budget;
        extended_asset payout_per_game;
        extended_asset balance_remaining;
        name           leftover_policy;
        uint32_t       games_linked = 0;

        uint64_t primary_key() const { return campaign_id; }
        uint64_t by_sponsor()  const { return sponsor.value; }
    };
    typedef multi_index<
        "campaigns"_n,
        campaign_record,
        indexed_by<"bysponsor"_n, const_mem_fun<campaign_record, uint64_t, &campaign_record::by_sponsor>>
    > campaigns_table;

    // ==========================================
    // PATTERNS (ADR-004 Fase 2)
    // ==========================================

    struct [[eosio::table("patterns")]] pattern_record {
        uint64_t    pattern_id;
        std::string name;
        uint32_t    mask;
        uint64_t primary_key() const { return pattern_id; }
    };
    typedef multi_index<"patterns"_n, pattern_record> patterns_table;

    struct pattern_rule {
        uint64_t pattern_id;
        uint8_t  weight;
    };

    // ==========================================
    // GAMETYPES (ADR-004 Fase 2)
    // ==========================================

    struct [[eosio::table("gametypes")]] gametype_record {
        uint64_t                  gametype_id;
        std::string               name;
        uint8_t                   base_multiplier;
        std::vector<pattern_rule> rules;
        uint64_t primary_key() const { return gametype_id; }
    };
    typedef multi_index<"gametypes"_n, gametype_record> gametypes_table;

    // ==========================================
    // ROOMS — Salas Persistentes (ADR-010)
    //
    // status FSM:
    //   inactive → active → paused → active (reversível)
    //                             → closed  (terminal)
    //
    // room_drop_chance_bps:
    //   Pré-check global de drop (0–10000). ADR-011 §7 Fase 0.
    // ==========================================

    struct [[eosio::table("rooms")]] room_record {
        uint64_t       room_id;
        name           sponsor;
        name           status;
        uint64_t       gametype_id;
        extended_asset ticket_price_min;
        extended_asset ticket_price_max;
        extended_asset ticket_price_default;
        uint32_t       max_tickets_per_player = 10;
        uint64_t       current_game_id        = 0;
        uint16_t       room_drop_chance_bps   = 10000;
        bool           sponsor_room           = false;
        time_point_sec created_at;

        uint64_t primary_key()  const { return room_id; }
        uint64_t by_sponsor()   const { return sponsor.value; }
        uint64_t by_status()    const { return status.value; }
    };
    typedef multi_index<
        "rooms"_n,
        room_record,
        indexed_by<"bysponsor"_n, const_mem_fun<room_record, uint64_t, &room_record::by_sponsor>>,
        indexed_by<"bystatus"_n,  const_mem_fun<room_record, uint64_t, &room_record::by_status>>
    > rooms_table;

    // ==========================================
    // DROP VAULT — Singleton (ADR-011)
    // ==========================================

    struct [[eosio::table("dropstate")]] drop_state {
        uint64_t next_deposit_id        = 1;
        uint64_t next_alloc_id          = 1;
        uint16_t player_base_chance_bps = 5000;
    };
    typedef singleton<"dropstate"_n, drop_state> drop_state_singleton;

    // ==========================================
    // DROP DEPOSITS (ADR-011)
    // status: available | allocated | depleted
    // ==========================================

    struct [[eosio::table("dropdeposits")]] drop_deposit {
        uint64_t       deposit_id;
        name           owner;
        name           asset_type;           // "token"_n | "nft"_n
        name           token_contract;
        symbol         token_symbol;
        extended_asset quantity_original;
        extended_asset quantity_remaining;
        uint64_t       nft_asset_id    = 0;
        int32_t        nft_template_id = 0;
        name           nft_collection;
        name           status;
        time_point_sec deposited_at;

        uint64_t primary_key()  const { return deposit_id; }
        uint64_t by_owner()     const { return owner.value; }
        uint64_t by_status()    const { return status.value; }
    };
    typedef multi_index<
        "dropdeposits"_n,
        drop_deposit,
        indexed_by<"byowner"_n,  const_mem_fun<drop_deposit, uint64_t, &drop_deposit::by_owner>>,
        indexed_by<"bystatus"_n, const_mem_fun<drop_deposit, uint64_t, &drop_deposit::by_status>>
    > drop_deposits_table;

    // ==========================================
    // DROP ALLOCATIONS (ADR-011)
    // status: active | exhausted | deallocated
    // ==========================================

    struct [[eosio::table("dropallocs")]] drop_allocation {
        uint64_t       alloc_id;
        uint64_t       deposit_id;
        name           owner;
        uint64_t       room_id;
        name           asset_type;
        name           token_contract;
        symbol         token_symbol;
        extended_asset quantity_per_drop;
        extended_asset quantity_distributed;
        uint64_t       nft_asset_id    = 0;
        int32_t        nft_template_id = 0;
        name           nft_collection;
        uint16_t       drop_chance_bps;
        uint32_t       drops_executed  = 0;
        name           status;
        time_point_sec allocated_at;

        uint64_t primary_key()  const { return alloc_id; }
        uint64_t by_room()      const { return room_id; }
        uint64_t by_deposit()   const { return deposit_id; }
        uint64_t by_owner()     const { return owner.value; }
    };
    typedef multi_index<
        "dropallocs"_n,
        drop_allocation,
        indexed_by<"byroom"_n,    const_mem_fun<drop_allocation, uint64_t, &drop_allocation::by_room>>,
        indexed_by<"bydeposit"_n, const_mem_fun<drop_allocation, uint64_t, &drop_allocation::by_deposit>>,
        indexed_by<"byowner"_n,   const_mem_fun<drop_allocation, uint64_t, &drop_allocation::by_owner>>
    > drop_allocations_table;

    // ==========================================
    // ATOMIC ASSETS (leitura de posse)
    // ==========================================

    struct asset_s {
        uint64_t              asset_id;
        name                  collection_name;
        name                  schema_name;
        int32_t               template_id;
        name                  ram_payer;
        std::vector<asset>    backed_tokens;
        std::vector<uint8_t>  immutable_serialized_data;
        std::vector<uint8_t>  mutable_serialized_data;
        uint64_t primary_key() const { return asset_id; }
    };
    typedef multi_index<"assets"_n, asset_s> atomic_assets_table;

    // ==========================================
    // CONTRACT
    // ==========================================

    class [[eosio::contract("bingo")]] bingo_contract : public contract {
    public:
        using contract::contract;

        // ── Configuração ─────────────────────────────────────────────────────
        [[eosio::action]] void setconfig(public_key signer_key);

        // ── FSM de Jogos ──────────────────────────────────────────────────────
        [[eosio::action]] void creategame(uint64_t game_id, extended_asset ticket_price, uint64_t gametype_id, uint64_t room_id);
        [[eosio::action]] void fundgame(uint64_t game_id);
        [[eosio::action]] void lockgame(uint64_t game_id);
        [[eosio::action]] void startdraw(uint64_t game_id);
        [[eosio::action]] void receiverand(uint64_t assoc_id, std::vector<char> random_bytes);
        [[eosio::action]] void claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask);
        [[eosio::action]] void abortgame(uint64_t game_id, std::string reason);
        [[eosio::action]] void refundticket(uint64_t game_id, uint64_t ticket_id);
        [[eosio::action]] void cleargame(uint64_t game_id, uint32_t max_rows);

        // ── NFT Config ───────────────────────────────────────────────────────
        [[eosio::action]] void setnftconf(int32_t template_id, uint8_t discount_pct, bool is_vip, uint32_t valid_until);
        [[eosio::action]] void delnftconf(int32_t template_id);

        // ── Padrões Dinâmicos (ADR-004 Fase 2) ───────────────────────────────
        [[eosio::action]] void addpattern(uint64_t pattern_id, std::string name, uint32_t mask);
        [[eosio::action]] void delpattern(uint64_t pattern_id);
        [[eosio::action]] void addgametype(uint64_t gametype_id, std::string name, uint8_t base_multiplier, std::vector<pattern_rule> rules);
        [[eosio::action]] void delgametype(uint64_t gametype_id);

        // ── Compra de Cartelas ───────────────────────────────────────────────
        [[eosio::action]] void buytickets(name buyer, uint64_t game_id, std::vector<std::vector<char>> matrices, std::vector<signature> signatures, uint64_t nft_id);

        // ── Patrocínio B2B ────────────────────────────────────────────────────
        [[eosio::action]] void linkcampaign(uint64_t game_id, uint64_t campaign_id);
        [[eosio::action]] void closecmpgn(uint64_t campaign_id);

        // ── Rooms (ADR-010) ───────────────────────────────────────────────────
        [[eosio::action]] void createroom(uint64_t room_id, name sponsor, uint64_t gametype_id, extended_asset ticket_price_min, extended_asset ticket_price_max, extended_asset ticket_price_default, uint32_t max_tickets_per_player, bool sponsor_room);
        [[eosio::action]] void activateroom(uint64_t room_id);
        [[eosio::action]] void pauseroom(uint64_t room_id);
        [[eosio::action]] void closeroom(uint64_t room_id);
        [[eosio::action]] void setroommeta(uint64_t room_id, uint16_t room_drop_chance_bps, uint32_t max_tickets_per_player);

        // ── Drop Vault (ADR-011) ──────────────────────────────────────────────
        [[eosio::action]] void allocatedrop(name caller, uint64_t deposit_id, uint64_t room_id, extended_asset quantity_per_drop, uint64_t nft_asset_id, uint16_t drop_chance_bps);
        [[eosio::action]] void deallocdrop(name caller, uint64_t alloc_id);
        [[eosio::action]] void reclaimasset(name owner, uint64_t deposit_id);
        [[eosio::action]] void execdrop(uint64_t alloc_id, name winner, extended_asset quantity);

        // ── Economia ─────────────────────────────────────────────────────────
        [[eosio::action]] void withdraw(name owner, extended_asset amount);

        // ── on_notify ─────────────────────────────────────────────────────────
        [[eosio::on_notify("*::transfer")]]
        void deposit(name from, name to, eosio::asset quantity, std::string memo);

        [[eosio::on_notify("atomicassets::transfer")]]
        void onnfttransfer(name from, name to, std::vector<uint64_t> asset_ids, std::string memo);

    private:
        drop_state _get_drop_state();
        void       _save_drop_state(drop_state& ds);
    };

}
