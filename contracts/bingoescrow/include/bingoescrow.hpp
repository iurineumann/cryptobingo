#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include <eosio/transaction.hpp>
#include <eosio/system.hpp>
#include <vector>
#include <string>

namespace bingoescrow {
    using namespace eosio;

    // ==========================================
    // CONSTANTES (spec §6)
    // ==========================================

    constexpr name    ATOMICASSETS     = "atomicassets"_n;
    constexpr name    ORNG_CONTRACT    = "orng.wax"_n;
    constexpr symbol  WAX_SYMBOL       = symbol("WAX", 8);
    constexpr int64_t MAX_TIER_AMOUNT  = 10'0000'0000;

    // ==========================================
    // ENUMS
    // ==========================================

    enum class price_mode : uint8_t { FIXED = 0, DYNAMIC = 1 };

    // ==========================================
    // ATOMICASSETS STRUCTS (leitura cross-contract)
    // ==========================================

    struct aa_collection_s {
        name                    collection_name;
        name                    author;
        bool                    allow_notify;
        std::vector<name>       authorized_accounts;
        std::vector<name>       notify_accounts;
        std::vector<double>     market_fee;
        std::vector<uint8_t>    serialized_data;
        uint64_t primary_key() const { return collection_name.value; }
    };
    typedef multi_index<"collections"_n, aa_collection_s> aa_collections_t;

    struct aa_asset_s {
        uint64_t                asset_id;
        name                    collection_name;
        name                    schema_name;
        int32_t                 template_id;
        name                    ram_payer;
        std::vector<asset>      backed_tokens;
        std::vector<uint8_t>    immutable_serialized_data;
        std::vector<uint8_t>    mutable_serialized_data;
        uint64_t primary_key() const { return asset_id; }
    };
    typedef multi_index<"assets"_n, aa_asset_s> aa_assets_t;

    // ==========================================
    // EOSIO.TOKEN ACCOUNTS (leitura cross-contract)
    // ==========================================

    struct account_s {
        asset    balance;
        uint64_t primary_key() const { return balance.symbol.code().raw(); }
    };
    typedef multi_index<"accounts"_n, account_s> accounts_t;

    // ==========================================
    // 1.0 CONFIG — Singleton
    // ==========================================

    struct [[eosio::table("config")]] config_row {
        uint8_t max_backings_per_asset;
    };
    using config_singleton = singleton<"config"_n, config_row>;

    // ==========================================
    // 1.1 TOKENS — Whitelist
    // ==========================================

    struct [[eosio::table("tokens")]] token_row {
        name     contract;
        symbol   sym;
        uint8_t  precision;
        bool     active;
        bool     can_back;

        uint64_t primary_key() const { return contract.value; }
    };
    typedef multi_index<"tokens"_n, token_row> tokens_t;

    // ==========================================
    // 1.2 BALANCES — Saldo alocado por depositor
    // ==========================================

    struct [[eosio::table("balances")]] balance_row {
        uint64_t id;
        name     depositor;
        name     token_contract;
        asset    balance;

        uint64_t  primary_key() const { return id; }
        uint128_t by_key() const {
            return ((uint128_t)depositor.value << 64) | token_contract.value;
        }
    };
    typedef multi_index<"balances"_n, balance_row,
        indexed_by<"bykey"_n, const_mem_fun<balance_row, uint128_t, &balance_row::by_key>>
    > balances_t;

    // ==========================================
    // 1.3 TIERPRICES — Templates
    // ==========================================

    struct [[eosio::table("tierprices")]] tierprice_row {
        uint64_t   id;
        name       collection_name;
        name       schema_name;
        int32_t    template_id;
        name       depositor;
        uint8_t    max_backings;
        price_mode mode;
        double     ref_ratio;
        double     max_ratio;

        uint64_t  primary_key() const { return id; }
        uint128_t by_key() const {
            return ((uint128_t)collection_name.value << 64) | (uint64_t)(uint32_t)template_id;
        }
    };
    typedef multi_index<"tierprices"_n, tierprice_row,
        indexed_by<"bykey"_n, const_mem_fun<tierprice_row, uint128_t, &tierprice_row::by_key>>
    > tierprices_t;

    // ==========================================
    // 1.4 BACKINGS — Backings do template (N por tierprice)
    // ==========================================

    struct [[eosio::table("backings")]] backing_row {
        uint64_t id;
        uint64_t tierprice_id;
        name     token_contract;
        asset    token_amount;
        bool     active;

        uint64_t primary_key()  const { return id; }
        uint64_t by_tierprice() const { return tierprice_id; }
    };
    typedef multi_index<"backings"_n, backing_row,
        indexed_by<"bytierprice"_n, const_mem_fun<backing_row, uint64_t, &backing_row::by_tierprice>>
    > backings_t;

    // ==========================================
    // 1.5 ACCEPTED_PAYMENTS — Token aceito (N por tierprice)
    // ==========================================

    struct [[eosio::table("acceptedpays")]] accepted_pay_row {
        uint64_t id;
        uint64_t tierprice_id;
        name     token_contract;
        asset    base_price;
        double   escalation;
        bool     active;

        uint64_t primary_key()  const { return id; }
        uint64_t by_tierprice() const { return tierprice_id; }
    };
    typedef multi_index<"acceptedpays"_n, accepted_pay_row,
        indexed_by<"bytierprice"_n, const_mem_fun<accepted_pay_row, uint64_t, &accepted_pay_row::by_tierprice>>
    > accepted_pays_t;

    // ==========================================
    // 1.6 ESCROWS — Registro de backing (N por asset_id)
    // ==========================================

    struct [[eosio::table("escrows")]] escrow_row {
        uint64_t esc_id;
        uint64_t asset_id;
        name     owner;
        name     depositor;
        name     token_contract;
        asset    token_amount;
        bool     claimed;
        uint8_t  source;

        uint64_t primary_key()  const { return esc_id; }
        uint64_t by_asset()     const { return asset_id; }
        uint64_t by_depositor() const { return depositor.value; }
    };
    typedef multi_index<"escrows"_n, escrow_row,
        indexed_by<"byasset"_n,     const_mem_fun<escrow_row, uint64_t, &escrow_row::by_asset>>,
        indexed_by<"bydepositor"_n, const_mem_fun<escrow_row, uint64_t, &escrow_row::by_depositor>>
    > escrows_t;

    // ==========================================
    // 1.7 AUDITS — Eventos de auditoria
    // ==========================================

    struct [[eosio::table("audits")]] audit_row {
        uint64_t   id;
        name       actor;
        name       action_name;
        time_point ts;

        uint64_t primary_key() const { return id; }
        uint64_t by_actor()    const { return actor.value; }
    };
    typedef multi_index<"audits"_n, audit_row,
        indexed_by<"byactor"_n, const_mem_fun<audit_row, uint64_t, &audit_row::by_actor>>
    > audits_t;

    // ==========================================
    // 1.8 PENDING_MINTS — Mints a aguardar confirmacao
    // ==========================================

    struct [[eosio::table("pendingmint")]] pending_mint_row {
        uint64_t mint_id;
        name     buyer;
        name     collection_name;
        int32_t  template_id;
        name     depositor;
        name     token_contract;
        asset    token_amount;
        bool     has_backing;

        uint64_t primary_key() const { return mint_id; }
        uint64_t by_buyer_tpl() const {
            return (uint64_t)(((uint128_t)buyer.value << 32) | (uint64_t)(uint32_t)template_id);
        }
    };
    typedef multi_index<"pendingmint"_n, pending_mint_row,
        indexed_by<"bybuyertpl"_n, const_mem_fun<pending_mint_row, uint64_t, &pending_mint_row::by_buyer_tpl>>
    > pending_mints_t;

    // ==========================================
    // 1.9 STRAYS — Self-rescue
    // ==========================================

    struct [[eosio::table("strays")]] stray_row {
        uint64_t asset_id;
        name     from;
        uint64_t primary_key() const { return asset_id; }
    };
    typedef multi_index<"strays"_n, stray_row> strays_t;

    // ==========================================
    // CONTRACT CLASS
    // ==========================================

    class [[eosio::contract("bingoescrow")]] bingoescrow_contract : public contract {
    public:
        using contract::contract;

        [[eosio::action]] void init();

        [[eosio::action]] void setconfig(uint8_t max_backings_per_asset);

        [[eosio::action]] void settoken(name contract, symbol sym, uint8_t precision,
                                        bool active, bool can_back);

        [[eosio::action]] void settierprice(name collection_name, name schema_name,
                                            int32_t template_id, name depositor,
                                            uint8_t max_backings, uint8_t mode,
                                            double ref_ratio, double max_ratio);

        [[eosio::action]] void setbacking(uint64_t tierprice_id, name token_contract,
                                          asset token_amount, bool active);

        [[eosio::action]] void setaccpay(uint64_t tierprice_id, name token_contract,
                                            asset base_price, double escalation,
                                            bool active);

        [[eosio::action]] void releaseburn(uint64_t asset_id, name owner);

        [[eosio::action]] void addbacking(name depositor, uint64_t asset_id,
                                          name token_contract, asset amount);

        [[eosio::action]] void cancelback(uint64_t esc_id);

        [[eosio::action]] void rescueasset(uint64_t asset_id);

        [[eosio::action]] void adminrescue(uint64_t asset_id, name to);

        [[eosio::action]] void withdraw(name depositor, name token_contract, asset amount);

        [[eosio::action]] void adminrel(name owner, uint64_t asset_id);

        // Notification handlers (called via apply())
        void on_transfer(name from, name to, asset quantity, std::string memo);

        void receive_asset(name from, name to, std::vector<uint64_t> asset_ids,
                           std::string memo);

        [[eosio::on_notify("atomicassets::logmint")]]
        void on_mint(uint64_t asset_id, name authorized_minter,
                     name collection_name, name schema_name,
                     int32_t template_id, name new_asset_owner);

    private:
        // ── Invariantes (§2) ──────────────────────────────────────────────────

        void _check_capacity(name depositor, name token_contract, asset amount);

        void _check_collection_auth(name collection_name);

        void _check_collection_notify(name collection_name);

        double _escrow_ratio(name depositor, name token_contract);

        asset _total_obligated(name depositor, name token_contract);

        asset _calculate_price(const accepted_pay_row& pay, double agg_ratio,
                               double ref_ratio, double max_ratio);

        // ── Helpers de lookup (§2.7) ──────────────────────────────────────────

        symbol _get_symbol(name token_contract);

        asset _inline_get_balance(name token_contract, name account);

        // ── Helpers de saldo (§3) ─────────────────────────────────────────────

        asset _balance_of(name depositor, name token_contract);

        asset _token_balance(name token_contract);

        void _credit_balance(name depositor, name token_contract, asset qty);

        void _debit_balance(name depositor, name token_contract, asset qty);

        void _release_token(name to, name token_contract, asset amount, std::string memo);

        // ── Auditoria ─────────────────────────────────────────────────────────

        void _audit(name action_name);

        void _redeem_asset(name to, uint64_t asset_id);
    };

}
