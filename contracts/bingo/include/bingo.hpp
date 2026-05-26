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
    //
    // Campos novos (SPEC.md §1.2):
    //   end_time    — setado no claimwin/abortgame; base para GC de 24h
    //   campaign_id — FK para tabela campaigns (0 se não patrocinado)
    // ==========================================

    struct [[eosio::table("games")]] game_state {
        uint64_t                    game_id;
        name                        status;         // FSM enum (ver acima)
        extended_asset              ticket_price;
        extended_asset              prize_pool;
        std::vector<extended_asset> sponsor_pool;   // Tokens B2B injetados via linkgame()
        std::vector<char>           drawn_balls;    // 75 posições após receiverand()
        uint64_t                    campaign_id = 0;
        uint64_t                    gametype_id = 0; // 0 = modo legado
        time_point_sec              end_time = time_point_sec(0); // Ref: SPEC.md §5.1

        uint64_t primary_key() const { return game_id; }
    };
    typedef multi_index<"games"_n, game_state> games_table;

    // ==========================================
    // TICKETS
    // ==========================================

    struct [[eosio::table("tickets")]] ticket_record {
        uint64_t           ticket_id;
        name               owner;
        std::vector<char>  matrix;
        uint32_t           state;   // Bitmask de progresso (bit 12 = FREE SPACE pré-setado)
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
    // CAMPAIGNS — Motor de Patrocínio B2B (SPEC.md §1.4)
    //
    // Scope: _self (global). Primary Key: campaign_id.
    //
    // Fluxo:
    //   1. Sponsor transfere tokens com memo "campaign:{id}" → on_notify registra budget
    //   2. Admin chama linkgame(game_id, campaign_id) → injeta payout_per_game no sponsor_pool
    //   3. Após o jogo, leftover_policy determina o destino do saldo residual
    //
    // leftover_policy:
    //   "refund"_n  → devolve saldo restante ao sponsor
    //   "house"_n   → saldo vai para a tesouraria (get_self())
    // ==========================================

    struct [[eosio::table("campaigns")]] campaign_record {
        uint64_t       campaign_id;
        name           sponsor;           // Conta patrocinadora e destinatária de estornos
        extended_asset total_budget;      // Liquidez total depositada (trustless)
        extended_asset payout_per_game;   // Fração a injetar por linkgame()
        extended_asset balance_remaining; // Saldo não utilizado
        name           leftover_policy;   // "refund"_n ou "house"_n
        uint32_t       games_linked = 0;  // Contador de jogos vinculados

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

    // ==========================================
    // GAMETYPE RULES (ADR-004 Fase 2)
    // ==========================================

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
        // creategame: inicia o jogo no estado CREATED (SPEC.md §1.2)
        [[eosio::action]] void creategame(uint64_t game_id, extended_asset ticket_price, uint64_t gametype_id);
        // fundgame: CREATED → FUNDING (abre vendas). Chamada pelo worker após agendamento.
        [[eosio::action]] void fundgame(uint64_t game_id);
        // lockgame: FUNDING → LOCKED
        [[eosio::action]] void lockgame(uint64_t game_id);
        // startdraw: LOCKED → DRAWING
        [[eosio::action]] void startdraw(uint64_t game_id);
        // receiverand: DRAWING → DRAWN (callback do oráculo)
        [[eosio::action]] void receiverand(uint64_t assoc_id, std::vector<char> random_bytes);
        // claimwin: DRAWN → ARCHIVED + seta end_time
        [[eosio::action]] void claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask);
        // abortgame: LOCKED|DRAWING → ABORTED + seta end_time (fail-safe)
        [[eosio::action]] void abortgame(uint64_t game_id, std::string reason);
        // refundticket: callable por qualquer um quando status = ABORTED (SPEC.md §5.2)
        [[eosio::action]] void refundticket(uint64_t game_id, uint64_t ticket_id);
        // cleargame: libera RAM após quarentena de 24h (SPEC.md §5.1)
        //   max_rows: número máximo de tickets a apagar por chamada (CPU budget WAX ~30ms)
        [[eosio::action]] void cleargame(uint64_t game_id, uint32_t max_rows);

        // ── NFT Config ───────────────────────────────────────────────────────
        [[eosio::action]] void setnftconf(int32_t template_id, uint8_t discount_pct, bool is_vip, uint32_t valid_until);
        [[eosio::action]] void delnftconf(int32_t template_id);

        // ── ADR-004 Fase 2 — Padrões Dinâmicos ───────────────────────────────
        [[eosio::action]] void addpattern(uint64_t pattern_id, std::string name, uint32_t mask);
        [[eosio::action]] void delpattern(uint64_t pattern_id);
        [[eosio::action]] void addgametype(uint64_t gametype_id, std::string name, uint8_t base_multiplier, std::vector<pattern_rule> rules);
        [[eosio::action]] void delgametype(uint64_t gametype_id);

        // ── Compra de Cartelas ───────────────────────────────────────────────
        [[eosio::action]] void buytickets(name buyer, uint64_t game_id, std::vector<std::vector<char>> matrices, std::vector<signature> signatures, uint64_t nft_id);

        // ── Patrocínio B2B (SPEC.md §1.4) ────────────────────────────────────
        // linkcampaign: vincula uma campanha a um jogo, injetando payout_per_game no sponsor_pool
        [[eosio::action]] void linkcampaign(uint64_t game_id, uint64_t campaign_id);
        // closecampaign: liquida o saldo residual conforme leftover_policy
        [[eosio::action]] void closecampaign(uint64_t campaign_id);

        // ── Economia ─────────────────────────────────────────────────────────
        [[eosio::action]] void withdraw(name owner, extended_asset amount);
        [[eosio::on_notify("*::transfer")]] void deposit(name from, name to, eosio::asset quantity, std::string memo);
    };

    // Serialização de tipos compostos para ABI (CDT)
    EOSIO_REFLECT(pattern_rule, pattern_id, weight)
}
