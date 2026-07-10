#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include <eosio/crypto.hpp>
#include <eosio/system.hpp>
#include <eosio/binary_extension.hpp>
#include <vector>
#include <string>

namespace bingo {
    using namespace eosio;

    // ==========================================
    // CONFIG
    // ==========================================

    struct [[eosio::table("config")]] config_state {
        public_key signer_key;
        name       treasury_account = "bingogamectr"_n; // destino do sweep de GGR (ADR-005)
        // binary_extension → compatível com linhas existentes que não têm o campo
        eosio::binary_extension<name> oracle_account;  // conta do oráculo RNG (paridade testnet/mainnet)
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
    // FSM: created → funding → locked → drawing → drawn → paying → archived
    //                                ↘ aborted (fail-safe; aceita: locked|drawing|paying)
    // ADR-012: paying = estado intermediário durante pagamento de múltiplos vencedores.
    // ==========================================

    struct [[eosio::table("games")]] game_state {
        uint64_t                    game_id;
        name                        status;
        extended_asset              ticket_price;
        extended_asset              total_wagered;
        std::vector<extended_asset> sponsor_pool;
        std::vector<char>           drawn_balls;
        uint64_t                    campaign_id       = 0;
        uint64_t                    gametype_id       = 0;
        uint64_t                    room_id           = 0;  // ADR-010: 0 = jogo avulso
        time_point_sec              end_time          = time_point_sec(0);
        uint8_t                     golden_ball_num   = 0;  // ADR-012: número da bola dourada (1-75; 0=nenhuma)
        uint16_t                    golden_multiplier = 0;  // ADR-012: multiplicador derivado (0=nenhum)
        int64_t                     total_paid        = 0;  // ADR-005: soma dos payouts (para cálculo do GGR)

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
        extended_asset     price;   // preço efetivo pago por este ticket (ADR-010 variable pricing)

        uint64_t primary_key()  const { return ticket_id; }
        uint64_t by_owner()     const { return owner.value; }
    };
    typedef multi_index<
        "tickets"_n,
        ticket_record,
        indexed_by<"byowner"_n, const_mem_fun<ticket_record, uint64_t, &ticket_record::by_owner>>
    > tickets_table;

    // ==========================================
    // NFT CONFIGS — Motor de Mecânicas NFT (ADR-028)
    //
    // Multi-regra por template. Substitui o modelo legado
    // (discount_pct/is_vip) por um vetor de regras tipadas.
    // ==========================================

    // Tipo da regra NFT (ADR-028 §1)
    enum nft_rule_type : uint8_t {
        RULE_TICKET_DISCOUNT = 1,  // desconto na compra de cartela
        RULE_PRIZE_BOOST     = 2,  // % extra no payout
        RULE_ROOM_ACCESS     = 3,  // acesso a salas restritas
        RULE_BURN_TO_CLAIM   = 4,  // queima → grant temporário
    };

    // Origem do valor da regra (ADR-028 §2)
    enum nft_value_origin : uint8_t {
        VALUE_FIXED        = 0,  // fixed_value (hundredths)
        VALUE_SCHEMA_FIELD = 1,  // lê do schema field da NFT (validação dupla)
    };

    // Condição de elegibilidade da regra
    enum nft_condition : uint8_t {
        COND_OWNS   = 0,  // jogador possui a NFT
        COND_BURNED = 1,  // jogador queimou a NFT (BURN_TO_CLAIM)
    };

    struct nft_rule {
        uint8_t               type;                   // nft_rule_type
        uint8_t               value_origin        = 0; // nft_value_origin
        uint16_t              fixed_value         = 0; // hundredths se VALUE_FIXED
        std::string           schema_field;            // nome do campo se VALUE_SCHEMA_FIELD
        uint8_t               max_uses            = 0; // 0 = ilimitado (consumível se > 0)
        uint32_t              grant_duration_sec  = 0; // p/ BURN_TO_CLAIM
        uint8_t               condition           = 0; // nft_condition
        std::vector<uint64_t> room_ids;                // p/ ROOM_ACCESS (vazio = todas)
    };

    struct [[eosio::table("nftconfigs")]] nft_config {
        uint64_t              template_id;
        name                  collection_name;
        std::vector<nft_rule> rules;
        uint64_t primary_key() const { return template_id; }
    };
    typedef multi_index<"nftconfigs"_n, nft_config> nftconfigs_table;

    // ==========================================
    // NFT BURNS / GRANTS — Burn detection híbrido (ADR-028 §8)
    //
    // Burn é detectado off-chain (AtomicAssets API) e registrado pelo worker
    // (bingogamesvc) via recordburn. Para regras BURN_TO_CLAIM, gera um grant
    // temporário. Trust model: igual ao claimwin (worker é trusted).
    // ==========================================

    struct [[eosio::table("nftseq")]] nft_seq {
        uint64_t next_burn_id  = 1;
        uint64_t next_grant_id = 1;
    };
    typedef singleton<"nftseq"_n, nft_seq> nft_seq_singleton;

    struct [[eosio::table("nftburns")]] nft_burn {
        uint64_t     burn_id;
        name         owner;
        uint64_t     asset_id;
        uint64_t     template_id;
        name         collection;
        time_point   burned_at;
        uint64_t primary_key() const { return burn_id; }
        uint64_t by_owner()    const { return owner.value; }
        uint64_t by_asset()    const { return asset_id; }
    };
    typedef multi_index<
        "nftburns"_n,
        nft_burn,
        indexed_by<"byowner"_n, const_mem_fun<nft_burn, uint64_t, &nft_burn::by_owner>>,
        indexed_by<"byasset"_n, const_mem_fun<nft_burn, uint64_t, &nft_burn::by_asset>>
    > nft_burns_table;

    struct [[eosio::table("nftgrants")]] nft_grant {
        uint64_t     grant_id;
        name         owner;
        uint64_t     template_id;
        uint8_t      rule_type;
        time_point   grant_until;
        uint64_t primary_key() const { return grant_id; }
        uint64_t by_owner()    const { return owner.value; }
    };
    typedef multi_index<
        "nftgrants"_n,
        nft_grant,
        indexed_by<"byowner"_n, const_mem_fun<nft_grant, uint64_t, &nft_grant::by_owner>>
    > nft_grants_table;

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
        uint16_t weight;             // hundredths (1.50 → 150)
    };

    // ADR-013: estágio progressivo para o modo MULTI_MATCH
    struct stage_rule {
        uint8_t  stage;              // 1, 2, 3... (ordenado crescentemente)
        uint8_t  patterns_required;  // nº de padrões simples que o ticket deve ter completado
        uint16_t weight;             // peso do prêmio em hundredths (100 = 1×)
    };

    // ADR-016: combinação de padrões como tier de prêmio superior.
    // A SATISFAÇÃO das cláusulas (all_of/any_of/n_of_type + tipos de padrão) é
    // computada OFF-CHAIN pelo worker (bingogamesvc) — assim como o match de
    // padrão em claimwin. On-chain guardamos apenas combo_id → weight: o
    // contrato VALIDA o weight do combo reclamado, impedindo que um worker
    // comprometido infle o prêmio. combo_id = índice canônico na lista off-chain.
    struct combo_rule {
        uint64_t combo_id;           // índice estável (0..n-1), espelha o off-chain
        uint16_t weight;             // peso do prêmio em hundredths (100 = 1×)
    };

    // ==========================================
    // GAMETYPES (ADR-004 Fase 2, ADR-012 Draw Modes)
    //
    // draw_mode values: "standard"_n (default) | "fixed"_n | "firstfull"_n |
    //                   "goldenball"_n | "multimatch"_n (reservado)
    //
    // max_balls: FIXED — número de bolas sorteadas (0 = 75, padrão)
    // golden_ball_after: GOLDEN_BALL — bolas normais antes da bola dourada
    // master_weight_ovrd: FIRST_FULL — peso customizado do padrão MASTER (0 = usa regra)
    // ==========================================

    struct [[eosio::table("gametypes")]] gametype_record {
        uint64_t                  gametype_id;
        std::string               name;
        uint8_t                   base_multiplier;
        std::vector<pattern_rule> rules;
        eosio::name               draw_mode          = "standard"_n;
        uint8_t                   max_balls          = 0;
        uint8_t                   golden_ball_after  = 0;
        uint16_t                  master_weight_ovrd = 0;
        std::vector<stage_rule>   stages;             // ADR-013: vazio = não é MULTI_MATCH
        // ADR-016: binary_extension → compatível com linhas existentes (sem este
        // campo) escritas antes do upgrade. Ausente = sem combinações.
        eosio::binary_extension<std::vector<combo_rule>> combinations;
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
        // ADR-028 §4: binary_extension → linhas de salas pré-existentes (sem estes
        // campos) continuam desserializando. Ausente = comportamento legado.
        eosio::binary_extension<std::vector<uint64_t>> nft_template_allowlist; // templates aceitos (vazio = todos)
        eosio::binary_extension<uint64_t>              campaign_id;            // vínculo de campanha (0 = nenhum)
        eosio::binary_extension<uint16_t>              house_fee_bps;          // taxa da casa sobre lucro do treasury
        eosio::binary_extension<uint32_t>              estimated_monthly_tickets; // projeção p/ colateral
        eosio::binary_extension<uint8_t>               difficulty;                // ADR-028 2D: 0-10 (XP multiplier, 0 = default 1)

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
    // ROOM TREASURIES — Sala patrocinada (ADR-028 §5)
    //
    // Sponsor custeia a sala: ticket sales creditam balance, payouts debitam
    // balance (nunca o house balance). `locked` é o colateral travado enquanto
    // a sala está ativa — sponsor não pode sacar. Um row por sala.
    // ==========================================

    struct [[eosio::table("roomtresry")]] room_treasury {
        uint64_t       room_id;
        extended_asset balance;   // saldo disponível (ticket sales + depósitos - payouts)
        extended_asset locked;    // colateral travado enquanto a sala está ativa
        uint64_t primary_key() const { return room_id; }
    };
    typedef multi_index<"roomtresry"_n, room_treasury> room_treasuries_table;

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
    // GGR POOL — Acumula margem retida por partida (ADR-005)
    // Chave: symbol_code.raw() — um row por token.
    // Alimentado por closegame; esvaziado por sweepggr.
    // ==========================================

    struct [[eosio::table("ggrpool")]] ggr_pool_row {
        extended_asset ggr;  // quantity + contract do token
        uint64_t primary_key() const { return ggr.quantity.symbol.code().raw(); }
    };
    typedef multi_index<"ggrpool"_n, ggr_pool_row> ggr_pool_table;

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

    // ADR-028 §2: leitura de schema/template do AtomicAssets para deserializar
    // schema fields on-chain (validação dupla). Espelha os structs do pinknetworkx.
    struct aa_format {
        std::string name;
        std::string type;
    };

    struct schema_s {
        name                   schema_name;
        std::vector<aa_format> format;
        uint64_t primary_key() const { return schema_name.value; }
    };
    typedef multi_index<"schemas"_n, schema_s> atomic_schemas_table; // scope = collection

    struct template_s {
        int32_t               template_id;
        name                  schema_name;
        bool                  transferable;
        bool                  burnable;
        uint32_t              max_supply;
        uint32_t              issued_supply;
        std::vector<uint8_t>  immutable_serialized_data;
        uint64_t primary_key() const { return (uint64_t)(int64_t)template_id; }
    };
    typedef multi_index<"templates"_n, template_s> atomic_templates_table; // scope = collection

    // ==========================================
    // CONTRACT
    // ==========================================

    class [[eosio::contract("bingo")]] bingo_contract : public contract {
    public:
        using contract::contract;

        // ── Configuração ─────────────────────────────────────────────────────
        [[eosio::action]] void setconfig(public_key signer_key);
        [[eosio::action]] void settreasury(name account); // ADR-005: define destino do sweep GGR
        // ADR-XXX: parametriza conta do oráculo RNG (padrão "orng.wax").
        // Chamado por admin (bingogamectr@admin). Exige conta existente on-chain.
        [[eosio::action]] void setoracle(name oracle);

        // ── FSM de Jogos ──────────────────────────────────────────────────────
        [[eosio::action]] void creategame(uint64_t game_id, extended_asset ticket_price, uint64_t gametype_id, uint64_t room_id);
        [[eosio::action]] void fundgame(uint64_t game_id);
        [[eosio::action]] void lockgame(uint64_t game_id);
        [[eosio::action]] void startdraw(uint64_t game_id);
        // Callback do orng.wax — compatível com legacy callback do ORNG de produção.
        // random_value: checksum256 = sha256(rsa_sig_hex) entregue pelo orng.wax::setrand.
        [[eosio::action]] void receiverand(uint64_t assoc_id, eosio::checksum256 random_value);
        // ADR-028 §7 (Fase 2): boost_nft_ids — prize boost. Param trailing
        // binary_extension. Todos os callers (worker + harness) passam o campo
        // explicitamente (wharfkit não omite binary_extension de array). O contrato
        // valida ownership + regra PRIZE_BOOST (FIXED) e aplica o maior boost.
        [[eosio::action]] void claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask, uint16_t golden_multiplier, eosio::binary_extension<std::vector<uint64_t>> boost_nft_ids);
        [[eosio::action]] void claimstage(uint64_t game_id, uint64_t ticket_id, uint8_t stage, uint8_t ball_count, uint64_t win_pattern_mask); // ADR-013
        [[eosio::action]] void claimcombo(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t combo_id, uint16_t golden_multiplier); // ADR-016
        [[eosio::action]] void closegame(uint64_t game_id);  // ADR-012: paying|drawn → archived
        [[eosio::action]] void abortgame(uint64_t game_id, std::string reason);
        [[eosio::action]] void refundticket(uint64_t game_id, uint64_t ticket_id);
        [[eosio::action]] void cleargame(uint64_t game_id, uint32_t max_rows);

        // ── NFT Config (ADR-028) ──────────────────────────────────────────────
        [[eosio::action]] void confignft(uint64_t template_id, name collection_name, std::vector<nft_rule> rules);
        [[eosio::action]] void delnftconf(uint64_t template_id);
        // ADR-028 §8: registra burn detectado off-chain (auth bingogamesvc).
        // Para regras BURN_TO_CLAIM do template, gera grant temporário.
        [[eosio::action]] void recordburn(name owner, uint64_t asset_id, uint64_t template_id, name collection);

        // ── Padrões Dinâmicos (ADR-004 Fase 2) ───────────────────────────────
        [[eosio::action]] void addpattern(uint64_t pattern_id, std::string name, uint32_t mask);
        [[eosio::action]] void delpattern(uint64_t pattern_id);
        [[eosio::action]] void addgametype(uint64_t gametype_id, std::string name, uint8_t base_multiplier, std::vector<pattern_rule> rules, eosio::name draw_mode, uint8_t max_balls, uint8_t golden_ball_after, uint16_t master_weight_ovrd);
        [[eosio::action]] void setstages(uint64_t gametype_id, std::vector<stage_rule> stages); // ADR-013
        [[eosio::action]] void setcombos(uint64_t gametype_id, std::vector<combo_rule> combinations); // ADR-016
        [[eosio::action]] void delgametype(uint64_t gametype_id);

        // ── Compra de Cartelas ───────────────────────────────────────────────
        [[eosio::action]] void buytickets(name buyer, uint64_t game_id, std::vector<std::vector<char>> matrices, std::vector<signature> signatures, uint64_t nft_id, extended_asset requested_price);

        // ── Patrocínio B2B ────────────────────────────────────────────────────
        [[eosio::action]] void linkcampaign(uint64_t game_id, uint64_t campaign_id);
        [[eosio::action]] void closecmpgn(uint64_t campaign_id);
        [[eosio::action]] void setcampaign(uint64_t campaign_id, extended_asset payout_per_game, name leftover_policy);

        // ── Rooms (ADR-010) ───────────────────────────────────────────────────
        [[eosio::action]] void createroom(uint64_t room_id, name sponsor, uint64_t gametype_id, extended_asset ticket_price_min, extended_asset ticket_price_max, extended_asset ticket_price_default, uint32_t max_tickets_per_player, bool sponsor_room);
        [[eosio::action]] void activateroom(uint64_t room_id);
        [[eosio::action]] void pauseroom(uint64_t room_id);
        [[eosio::action]] void closeroom(uint64_t room_id);
        [[eosio::action]] void setroommeta(uint64_t room_id, uint16_t room_drop_chance_bps, uint32_t max_tickets_per_player, uint8_t difficulty = 1);
        // Altera os preços de ticket de uma sala existente (mesma validação do createroom).
        // Bloqueia se a sala tiver jogo em andamento (current_game_id != 0) para evitar
        // inconsistência com jogos em curso.
        [[eosio::action]] void updateroom(uint64_t room_id, extended_asset ticket_price_min, extended_asset ticket_price_max, extended_asset ticket_price_default);
        // ADR-028 §4: configura economia de sala patrocinada (allowlist, campanha, taxa, projeção)
        [[eosio::action]] void setroomnft(uint64_t room_id, std::vector<uint64_t> nft_template_allowlist, uint64_t campaign_id, uint16_t house_fee_bps, uint32_t estimated_monthly_tickets);
        // ADR-028 §5: sponsor saca saldo disponível (não-travado) do treasury da sala
        [[eosio::action]] void withdrawroom(uint64_t room_id, extended_asset amount);

        // ── Drop Vault (ADR-011) ──────────────────────────────────────────────
        [[eosio::action]] void allocatedrop(name caller, uint64_t deposit_id, uint64_t room_id, extended_asset quantity_per_drop, uint64_t nft_asset_id, uint16_t drop_chance_bps);
        [[eosio::action]] void deallocdrop(name caller, uint64_t alloc_id);
        [[eosio::action]] void reclaimasset(name owner, uint64_t deposit_id);
        [[eosio::action]] void execdrop(uint64_t alloc_id, name winner, extended_asset quantity);

        // ── Autenticação off-chain (ADR-006) ──────────────────────────────────
        // Action dummy para login via carteira. O worker nunca chama esta ação.
        // Nonce assinado prova posse da chave privada. broadcast:false no frontend.
        [[eosio::action]] void userlogin(const std::vector<char>& nonce_data);

        // ── Economia ─────────────────────────────────────────────────────────
        [[eosio::action]] void withdraw(name owner, extended_asset amount);
        // ADR-005: transfere GGR acumulado (ggrpool) para treasury_account
        [[eosio::action]] void sweepggr(name token_contract, symbol_code sym);

        // ── on_notify ─────────────────────────────────────────────────────────
        [[eosio::on_notify("*::transfer")]]
        void deposit(name from, name to, eosio::asset quantity, std::string memo);

        [[eosio::on_notify("atomicassets::transfer")]]
        void onnfttransfer(name from, name to, std::vector<uint64_t> asset_ids, std::string memo);

    private:
        drop_state _get_drop_state();
        void       _save_drop_state(drop_state& ds);

        // ADR-028 §2: lê um schema field NUMÉRICO de um asset (deserialização ALPHA
        // AtomicAssets on-chain). Tenta o immutable do asset; se ausente, o do
        // template. Retorna true + valor se encontrado e numérico.
        bool _read_schema_numeric(name collection, name schema, int32_t template_id,
                                  const std::vector<uint8_t>& asset_imm,
                                  const std::string& field, uint64_t& out);
    };

}
