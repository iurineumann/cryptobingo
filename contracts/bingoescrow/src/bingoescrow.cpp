#include <bingoescrow.hpp>

namespace bingoescrow {

    // ==========================================
    // §4.0 — init (stub Fase 1, apenas para compilacao)
    // ==========================================

    void bingoescrow_contract::init() {
        require_auth(get_self());
    }

    // ==========================================
    // §2.1 — _check_capacity
    // ==========================================

    void bingoescrow_contract::_check_capacity(name depositor, name token_contract, asset amount) {
        balances_t balances(get_self(), get_self().value);
        auto idx = balances.get_index<"bykey"_n>();
        auto it = idx.find(((uint128_t)depositor.value << 64) | token_contract.value);
        check(it != idx.end(), "Depositor has no balance for this token");
        asset obrigado = _total_obligated(depositor, token_contract);
        asset apos = obrigado + amount;
        check(apos <= it->balance,
            "Depositor insufficient capacity");
    }

    // ==========================================
    // §2.2 — _check_collection_auth
    // ==========================================

    void bingoescrow_contract::_check_collection_auth(name collection_name) {
        aa_collections_t aa_colls(ATOMICASSETS, ATOMICASSETS.value);
        auto coll = aa_colls.require_find(collection_name.value, "Collection not found");
        auto& accs = coll->authorized_accounts;
        check(std::find(accs.begin(), accs.end(), get_self()) != accs.end(),
            "Not authorized to mint in collection");
    }

    // ==========================================
    // §2.3 — _check_collection_notify
    // ==========================================

    void bingoescrow_contract::_check_collection_notify(name collection_name) {
        aa_collections_t aa_colls(ATOMICASSETS, ATOMICASSETS.value);
        auto coll = aa_colls.require_find(collection_name.value, "Collection not found");
        auto& accs = coll->notify_accounts;
        check(std::find(accs.begin(), accs.end(), get_self()) != accs.end(),
            "Not in notify_accounts of collection");
    }

    // ==========================================
    // §2.4 — _escrow_ratio
    // ==========================================

    double bingoescrow_contract::_escrow_ratio(name depositor, name token_contract) {
        balances_t balances(get_self(), get_self().value);
        auto idx = balances.get_index<"bykey"_n>();
        auto it = idx.find(((uint128_t)depositor.value << 64) | token_contract.value);
        if (it == idx.end() || it->balance.amount == 0) return 0.0;
        auto obrigado = _total_obligated(depositor, token_contract);
        return (double)obrigado.amount / (double)it->balance.amount;
    }

    // ==========================================
    // §2.5 — _total_obligated
    // ==========================================

    asset bingoescrow_contract::_total_obligated(name depositor, name token_contract) {
        asset total{0, _get_symbol(token_contract)};
        escrows_t escrows(get_self(), get_self().value);
        auto idx = escrows.get_index<"bydepositor"_n>();
        for (auto it = idx.lower_bound(depositor.value);
             it != idx.end() && it->depositor == depositor; it++) {
            if (it->token_contract == token_contract && !it->claimed)
                total += it->token_amount;
        }
        return total;
    }

    // ==========================================
    // §2.6 — _calculate_price (bonding curve)
    // ==========================================

    asset bingoescrow_contract::_calculate_price(const accepted_pay_row& pay, double agg_ratio,
                                                  double ref_ratio, double max_ratio) {
        if (agg_ratio >= max_ratio) check(false, "Escrow exhausted");
        double mult = 1.0 + pay.escalation * (agg_ratio - ref_ratio);
        if (mult < 0.1) mult = 0.1;
        return asset{(int64_t)((double)pay.base_price.amount * mult), pay.base_price.symbol};
    }

    // ==========================================
    // §2.7 — _get_symbol
    // ==========================================

    symbol bingoescrow_contract::_get_symbol(name token_contract) {
        tokens_t tkns(get_self(), get_self().value);
        auto t = tkns.find(token_contract.value);
        check(t != tkns.end(), "Token not whitelisted");
        return symbol(t->sym.code(), t->precision);
    }

    // ==========================================
    // §2.7 — _inline_get_balance
    // ==========================================

    asset bingoescrow_contract::_inline_get_balance(name token_contract, name account) {
        accounts_t accts(token_contract, account.value);
        symbol sym = _get_symbol(token_contract);
        auto a = accts.find(sym.code().raw());
        check(a != accts.end(), "No token balance for account");
        return a->balance;
    }

    // ==========================================
    // §3 — _balance_of
    // ==========================================

    asset bingoescrow_contract::_balance_of(name depositor, name token_contract) {
        balances_t balances(get_self(), get_self().value);
        auto idx = balances.get_index<"bykey"_n>();
        auto it = idx.find(((uint128_t)depositor.value << 64) | token_contract.value);
        return it != idx.end() ? it->balance : asset{0, _get_symbol(token_contract)};
    }

    // ==========================================
    // §3 — _token_balance
    // ==========================================

    asset bingoescrow_contract::_token_balance(name token_contract) {
        return _inline_get_balance(token_contract, get_self());
    }

    // ==========================================
    // §3 — _credit_balance
    // ==========================================

    void bingoescrow_contract::_credit_balance(name depositor, name token_contract, asset qty) {
        balances_t balances(get_self(), get_self().value);
        auto idx = balances.get_index<"bykey"_n>();
        auto it = idx.find(((uint128_t)depositor.value << 64) | token_contract.value);
        if (it != idx.end()) {
            idx.modify(it, same_payer, [&](auto& row) { row.balance += qty; });
        } else {
            balances.emplace(get_self(), [&](auto& row) {
                row.id             = balances.available_primary_key();
                row.depositor      = depositor;
                row.token_contract = token_contract;
                row.balance        = qty;
            });
        }
    }

    // ==========================================
    // §3 — _debit_balance
    // ==========================================

    void bingoescrow_contract::_debit_balance(name depositor, name token_contract, asset qty) {
        balances_t balances(get_self(), get_self().value);
        auto idx = balances.get_index<"bykey"_n>();
        auto it = idx.require_find(((uint128_t)depositor.value << 64) | token_contract.value,
            "No balance to debit");
        check(it->balance >= qty, "Insufficient allocated balance");
        idx.modify(it, same_payer, [&](auto& row) { row.balance -= qty; });
    }

    // ==========================================
    // §3 — _release_token
    // ==========================================

    void bingoescrow_contract::_release_token(name to, name token_contract, asset amount, std::string memo) {
        check(_token_balance(token_contract) >= amount,
            "Insufficient token balance in contract");
        action(
            permission_level{get_self(), "active"_n},
            token_contract,
            "transfer"_n,
            std::make_tuple(get_self(), to, amount, memo)
        ).send();
    }

    // ==========================================
    // _audit
    // ==========================================

    void bingoescrow_contract::_audit(name action_name) {
        audits_t audits(get_self(), get_self().value);
        name signer = get_self();
        for (auto& a : get_action(0, 0).authorization)
            if (a.actor != get_self()) { signer = a.actor; break; }
        audits.emplace(get_self(), [&](auto& row) {
            row.id          = audits.available_primary_key();
            row.actor       = signer;
            row.action_name = action_name;
            row.ts          = current_time_point();
        });
    }

}
