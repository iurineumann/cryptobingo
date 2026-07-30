#include <bingoescrow.hpp>

namespace bingoescrow {

    // ==========================================
    // §4.0 — init
    // ==========================================

    void bingoescrow_contract::init() {
        require_auth(get_self());

        config_singleton cfg(get_self(), get_self().value);
        check(!cfg.exists(), "Already initialized");

        cfg.set(config_row{
            .max_backings_per_asset = 5
        }, get_self());
    }

    // ==========================================
    // §4.1 — setconfig
    // ==========================================

    void bingoescrow_contract::setconfig(uint8_t max_backings_per_asset) {
        require_auth(permission_level{get_self(), "admin"_n});

        check(max_backings_per_asset > 0 && max_backings_per_asset <= 50,
            "max_backings_per_asset must be between 1 and 50");

        config_singleton cfg(get_self(), get_self().value);
        check(cfg.exists(), "Not initialized");

        cfg.set(config_row{
            .max_backings_per_asset = max_backings_per_asset
        }, get_self());

        _audit("setconfig"_n);
    }

    // ==========================================
    // §4.2 — settoken
    // ==========================================

    void bingoescrow_contract::settoken(name contract, symbol sym, uint8_t precision,
                                        bool active, bool can_back) {
        require_auth(permission_level{get_self(), "admin"_n});

        tokens_t tkns(get_self(), get_self().value);
        auto it = tkns.find(contract.value);

        if (it != tkns.end()) {
            tkns.modify(it, same_payer, [&](auto& row) {
                row.sym       = sym;
                row.precision = precision;
                row.active    = active;
                row.can_back  = can_back;
            });
        } else {
            tkns.emplace(get_self(), [&](auto& row) {
                row.contract  = contract;
                row.sym       = sym;
                row.precision = precision;
                row.active    = active;
                row.can_back  = can_back;
            });
        }

        _audit("settoken"_n);
    }

    // ==========================================
    // §4.3 — settierprice
    // ==========================================

    void bingoescrow_contract::settierprice(name collection_name, name schema_name,
                                            int32_t template_id, name depositor,
                                            uint8_t max_backings, uint8_t mode,
                                            double ref_ratio, double max_ratio) {
        require_auth(permission_level{get_self(), "admin"_n});

        check(mode <= 1, "mode must be 0 (FIXED) or 1 (DYNAMIC)");
        check(template_id >= 0, "template_id must be >= 0");

        _check_collection_auth(collection_name);
        _check_collection_notify(collection_name);

        tierprices_t tps(get_self(), get_self().value);
        auto tp_idx = tps.get_index<"bykey"_n>();
        uint128_t key = ((uint128_t)collection_name.value << 64)
                        | (uint64_t)(uint32_t)template_id;
        auto tp_it = tp_idx.find(key);

        if (tp_it != tp_idx.end()) {
            tp_idx.modify(tp_it, same_payer, [&](auto& row) {
                row.schema_name   = schema_name;
                row.depositor     = depositor;
                row.max_backings  = max_backings;
                row.mode          = (price_mode)mode;
                row.ref_ratio     = ref_ratio;
                row.max_ratio     = max_ratio;
            });
        } else {
            tps.emplace(get_self(), [&](auto& row) {
                row.id              = tps.available_primary_key();
                row.collection_name = collection_name;
                row.schema_name     = schema_name;
                row.template_id     = template_id;
                row.depositor       = depositor;
                row.max_backings    = max_backings;
                row.mode            = (price_mode)mode;
                row.ref_ratio       = ref_ratio;
                row.max_ratio       = max_ratio;
            });
        }

        _audit("settierprice"_n);
    }

    // ==========================================
    // §4.4 — setbacking
    // ==========================================

    void bingoescrow_contract::setbacking(uint64_t tierprice_id, name token_contract,
                                          asset token_amount, bool active) {
        require_auth(permission_level{get_self(), "admin"_n});

        tokens_t tkns(get_self(), get_self().value);
        auto tkn = tkns.require_find(token_contract.value,
            "Token not whitelisted");
        check(tkn->can_back, "Token not authorized as backing");

        check(token_amount.amount <= MAX_TIER_AMOUNT,
            "token_amount exceeds MAX_TIER_AMOUNT");

        tierprices_t tps(get_self(), get_self().value);
        tps.require_find(tierprice_id, "Tierprice not found");

        backings_t bks(get_self(), get_self().value);
        bks.emplace(get_self(), [&](auto& row) {
            row.id            = bks.available_primary_key();
            row.tierprice_id  = tierprice_id;
            row.token_contract = token_contract;
            row.token_amount  = token_amount;
            row.active        = active;
        });

        _audit("setbacking"_n);
    }

    // ==========================================
    // §4.5 — setaccpay
    // ==========================================

    void bingoescrow_contract::setaccpay(uint64_t tierprice_id, name token_contract,
                                         asset base_price, double escalation,
                                         bool active) {
        require_auth(permission_level{get_self(), "admin"_n});

        tokens_t tkns(get_self(), get_self().value);
        auto tkn = tkns.require_find(token_contract.value,
            "Token not whitelisted");
        check(tkn->active, "Token not active for payments");

        tierprices_t tps(get_self(), get_self().value);
        tps.require_find(tierprice_id, "Tierprice not found");

        accepted_pays_t aps(get_self(), get_self().value);
        aps.emplace(get_self(), [&](auto& row) {
            row.id            = aps.available_primary_key();
            row.tierprice_id  = tierprice_id;
            row.token_contract = token_contract;
            row.base_price    = base_price;
            row.escalation    = escalation;
            row.active        = active;
        });

        _audit("setaccpay"_n);
    }

    // ==========================================
    // §4.6 — on_transfer (called via apply)
    // ==========================================

    void bingoescrow_contract::on_transfer(name from, name to, asset quantity,
                                           std::string memo) {
        if (to != get_self() || from == get_self()) return;

        name contract_name = get_first_receiver();
        if (contract_name == ATOMICASSETS) return;

        tokens_t tkns(get_self(), get_self().value);
        auto tkn = tkns.find(contract_name.value);
        if (tkn == tkns.end()) return;

        if (!tkn->active) {
            _credit_balance(from, contract_name, quantity);
            return;
        }

        if (memo.find("buy:") == 0) {
            std::string params = memo.substr(4);
            size_t sep = params.find(',');
            check(sep != std::string::npos, "Invalid buy memo format");
            uint64_t tp_id  = std::stoull(params.substr(0, sep));
            uint64_t pay_id = std::stoull(params.substr(sep + 1));

            tierprices_t tps(get_self(), get_self().value);
            auto tp = tps.require_find(tp_id, "Tierprice not found");

            accepted_pays_t aps(get_self(), get_self().value);
            auto pay = aps.require_find(pay_id, "Accepted payment not found");
            check(pay->active, "Payment method inactive");

            check(contract_name == pay->token_contract,
                "Payment token mismatch");

            double agg_ratio = _escrow_ratio(tp->depositor, pay->token_contract);
            asset preco = _calculate_price(*pay, agg_ratio,
                                           tp->ref_ratio, tp->max_ratio);
            check(quantity.amount == preco.amount,
                "Incorrect payment amount");

            _credit_balance(tp->depositor, pay->token_contract, quantity);

            backings_t bks(get_self(), get_self().value);
            auto bk_idx = bks.get_index<"bytierprice"_n>();
            auto bk_it = bk_idx.lower_bound(tp_id);
            while (bk_it != bk_idx.end() && bk_it->tierprice_id == tp_id) {
                if (bk_it->active) {
                    _check_capacity(tp->depositor, bk_it->token_contract,
                                    bk_it->token_amount);
                }
                bk_it++;
            }

            pending_mints_t pm(get_self(), get_self().value);
            pm.emplace(get_self(), [&](auto& row) {
                row.mint_id        = pm.available_primary_key();
                row.buyer          = from;
                row.collection_name = tp->collection_name;
                row.template_id    = tp->template_id;
                row.depositor      = tp->depositor;
                row.token_contract = pay->token_contract;
                row.token_amount   = quantity;
                row.has_backing    = true;
            });

            action(
                permission_level{get_self(), "active"_n},
                ATOMICASSETS,
                "mintasset"_n,
                std::make_tuple(get_self(), tp->collection_name,
                                tp->schema_name, tp->template_id, from,
                                std::vector<asset>{}, std::vector<asset>{})
            ).send();

            return;
        }

        _credit_balance(from, contract_name, quantity);
    }

    // ==========================================
    // §4.7 — on_mint (called via apply, logmint notification)
    // ==========================================

    void bingoescrow_contract::on_mint(uint64_t asset_id, name authorized_minter,
                                       name collection_name, name schema_name,
                                       int32_t template_id, name new_asset_owner) {
        if (authorized_minter != get_self()) return;

        pending_mints_t pm(get_self(), get_self().value);
        auto pm_idx = pm.get_index<"bybuyertpl"_n>();
        uint64_t bt_key = (uint64_t)(((uint128_t)new_asset_owner.value << 32)
                                     | (uint64_t)(uint32_t)template_id);
        auto pm_it = pm_idx.lower_bound(bt_key);
        for (; pm_it != pm_idx.end() &&
               pm_it->buyer == new_asset_owner &&
               pm_it->template_id == template_id;
             ++pm_it) {
            break;
        }
        check(pm_it != pm_idx.end() &&
              pm_it->buyer == new_asset_owner &&
              pm_it->template_id == template_id,
              "Pending mint not found");

        auto pending = *pm_it;

        tierprices_t tps(get_self(), get_self().value);
        auto tp_idx = tps.get_index<"bykey"_n>();
        uint128_t tp_key = ((uint128_t)collection_name.value << 64)
                           | (uint64_t)(uint32_t)template_id;
        auto tp = tp_idx.require_find(tp_key, "Tierprice not found");

        backings_t bks(get_self(), get_self().value);
        auto bk_idx = bks.get_index<"bytierprice"_n>();
        auto bk_it = bk_idx.lower_bound(tp->id);
        while (bk_it != bk_idx.end() && bk_it->tierprice_id == tp->id) {
            if (bk_it->active) {
                _debit_balance(pending.depositor,
                               bk_it->token_contract,
                               bk_it->token_amount);

                escrows_t esc(get_self(), get_self().value);
                esc.emplace(get_self(), [&](auto& row) {
                    row.esc_id         = esc.available_primary_key();
                    row.asset_id       = asset_id;
                    row.owner          = new_asset_owner;
                    row.depositor      = pending.depositor;
                    row.token_contract = bk_it->token_contract;
                    row.token_amount   = bk_it->token_amount;
                    row.claimed        = false;
                    row.source         = 0;
                });
            }
            bk_it++;
        }

        pm_idx.erase(pm_it);
    }

    // ==========================================
    // §4.8 — receive_asset (called via apply, atomicassets transfer notify)
    // ==========================================

    void bingoescrow_contract::receive_asset(name from, name to,
                                             std::vector<uint64_t> asset_ids,
                                             std::string memo) {
        if (to != get_self()) return;

        for (uint64_t asset_id : asset_ids) {
            escrows_t esc(get_self(), get_self().value);
            auto esc_idx = esc.get_index<"byasset"_n>();
            auto it = esc_idx.lower_bound(asset_id);

            if (it == esc_idx.end() || it->asset_id != asset_id) {
                aa_assets_t aa(ATOMICASSETS, get_self().value);
                auto asset_itr = aa.find(asset_id);
                if (asset_itr != aa.end() &&
                    asset_itr->collection_name == name("cryptobingo1")) {
                    strays_t strays(get_self(), get_self().value);
                    strays.emplace(get_self(), [&](auto& row) {
                        row.asset_id = asset_id;
                        row.from     = from;
                    });
                }
                continue;
            }

            std::vector<decltype(it)> pendentes;
            auto e = it;
            for (; e != esc_idx.end() && e->asset_id == asset_id; e++) {
                check(!e->claimed, "Already claimed");
                asset real = _token_balance(e->token_contract);
                asset aloc = _balance_of(e->depositor, e->token_contract);
                int64_t min_amount = real.amount < aloc.amount
                                     ? real.amount : aloc.amount;
                check(min_amount >= e->token_amount.amount,
                    "Insufficient funds for redeem");
                pendentes.push_back(e);
            }

            std::sort(pendentes.begin(), pendentes.end(),
                [&](auto& a, auto& b) {
                    return _token_balance(a->token_contract).amount <
                           _token_balance(b->token_contract).amount;
                });

            for (auto& pe : pendentes) {
                _debit_balance(pe->depositor, pe->token_contract,
                               pe->token_amount);
                _release_token(from, pe->token_contract,
                               pe->token_amount, "redeem");
                esc_idx.modify(pe, same_payer, [&](auto& row) {
                    row.claimed = true;
                });
            }

            action(
                permission_level{get_self(), "active"_n},
                ATOMICASSETS,
                "burnasset"_n,
                std::make_tuple(get_self(), asset_id)
            ).send();
        }
    }

    // ==========================================
    // §4.9 — releaseburn (route 3)
    // ==========================================

    void bingoescrow_contract::releaseburn(uint64_t asset_id, name owner) {
        require_auth(permission_level{get_self(), "bot"_n});

        aa_assets_t aa(ATOMICASSETS, owner.value);
        check(aa.find(asset_id) == aa.end(), "Asset not yet burned");

        escrows_t esc(get_self(), get_self().value);
        auto esc_idx = esc.get_index<"byasset"_n>();
        auto it = esc_idx.lower_bound(asset_id);

        std::vector<decltype(it)> pendentes;
        for (auto e = it; e != esc_idx.end() && e->asset_id == asset_id; e++) {
            if (!e->claimed)
                pendentes.push_back(e);
        }

        check(!pendentes.empty(), "No unclaimed escrows for this asset");

        for (auto& pe : pendentes) {
            _debit_balance(pe->depositor, pe->token_contract,
                           pe->token_amount);
            _release_token(owner, pe->token_contract,
                           pe->token_amount, "redeem-burn");
            esc_idx.modify(pe, same_payer, [&](auto& row) {
                row.claimed = true;
            });
        }

        _audit("releaseburn"_n);
    }

    // ==========================================
    // §4.10 — addbacking (pre-fund model)
    // ==========================================

    void bingoescrow_contract::addbacking(name depositor, uint64_t asset_id,
                                          name token_contract, asset amount) {
        require_auth(depositor);

        tokens_t tkns(get_self(), get_self().value);
        auto tkn = tkns.require_find(token_contract.value,
            "Token not whitelisted");
        check(tkn->can_back, "Token not authorized as backing");

        check(amount.amount > 0, "Amount must be positive");
        check(amount.amount <= MAX_TIER_AMOUNT, "Amount exceeds MAX_TIER_AMOUNT");

        config_singleton cfg(get_self(), get_self().value);
        check(cfg.exists(), "Not initialized");
        auto conf = cfg.get();

        escrows_t esc(get_self(), get_self().value);
        auto esc_idx = esc.get_index<"byasset"_n>();
        int active_escrows = 0;
        for (auto e = esc_idx.lower_bound(asset_id);
             e != esc_idx.end() && e->asset_id == asset_id; e++) {
            if (!e->claimed) active_escrows++;
        }
        check(active_escrows < conf.max_backings_per_asset,
            "Max backings per asset reached");

        _check_capacity(depositor, token_contract, amount);

        esc.emplace(get_self(), [&](auto& row) {
            row.esc_id         = esc.available_primary_key();
            row.asset_id       = asset_id;
            row.owner          = name(0);
            row.depositor      = depositor;
            row.token_contract = token_contract;
            row.token_amount   = amount;
            row.claimed        = false;
            row.source         = 1;
        });

        _audit("addbacking"_n);
    }

    // ==========================================
    // §4.11 — cancelback
    // ==========================================

    void bingoescrow_contract::cancelback(uint64_t esc_id) {
        escrows_t esc(get_self(), get_self().value);
        auto it = esc.require_find(esc_id, "Escrow not found");

        require_auth(it->depositor);

        check(it->source == 1, "Only addbacking escrows can be cancelled");
        check(!it->claimed, "Already claimed");

        _debit_balance(it->depositor, it->token_contract, it->token_amount);
        _release_token(it->depositor, it->token_contract,
                       it->token_amount, "cancelled");

        esc.erase(it);

        _audit("cancelback"_n);
    }

    // ==========================================
    // §4.12 — rescueasset
    // ==========================================

    void bingoescrow_contract::rescueasset(uint64_t asset_id) {
        strays_t strays(get_self(), get_self().value);
        auto stray = strays.require_find(asset_id, "Asset not in strays");

        require_auth(stray->from);

        action(
            permission_level{get_self(), "active"_n},
            ATOMICASSETS,
            "transfer"_n,
            std::make_tuple(get_self(), stray->from,
                            std::vector<uint64_t>{asset_id},
                            std::string("rescue"))
        ).send();

        strays.erase(stray);

        _audit("rescueasset"_n);
    }

    // ==========================================
    // §4.12 — adminrescue
    // ==========================================

    void bingoescrow_contract::adminrescue(uint64_t asset_id, name to) {
        require_auth(permission_level{get_self(), "admin"_n});

        aa_assets_t aa(ATOMICASSETS, get_self().value);
        check(aa.find(asset_id) != aa.end(),
            "Asset not owned by contract");

        action(
            permission_level{get_self(), "active"_n},
            ATOMICASSETS,
            "transfer"_n,
            std::make_tuple(get_self(), to,
                            std::vector<uint64_t>{asset_id},
                            std::string("admin-rescue"))
        ).send();

        strays_t strays(get_self(), get_self().value);
        auto stray = strays.find(asset_id);
        if (stray != strays.end()) strays.erase(stray);

        _audit("adminrescue"_n);
    }

    // ==========================================
    // §4.13 — withdraw
    // ==========================================

    void bingoescrow_contract::withdraw(name depositor, name token_contract,
                                        asset amount) {
        require_auth(depositor);

        check(amount.amount > 0, "Amount must be positive");

        asset allocated = _balance_of(depositor, token_contract);
        asset obligated = _total_obligated(depositor, token_contract);
        asset free = allocated - obligated;

        check(amount <= free, "Insufficient free balance (pending obligations)");

        _release_token(depositor, token_contract, amount, "withdraw");
        _debit_balance(depositor, token_contract, amount);

        _audit("withdraw"_n);
    }

    // ==========================================
    // §4.14 — adminrel (emergency)
    // ==========================================

    void bingoescrow_contract::adminrel(name owner, uint64_t asset_id) {
        require_auth(permission_level{get_self(), "admin"_n});

        _redeem_asset(owner, asset_id);

        _audit("adminrel"_n);
    }

    // ==========================================
    // §5 — _redeem_asset (core redeem logic)
    // ==========================================

    void bingoescrow_contract::_redeem_asset(name to, uint64_t asset_id) {
        escrows_t esc(get_self(), get_self().value);
        auto idx = esc.get_index<"byasset"_n>();
        auto it = idx.lower_bound(asset_id);
        check(it != idx.end() && it->asset_id == asset_id,
            "No escrows for asset");

        std::vector<decltype(it)> pendentes;
        for (auto e = it; e != idx.end() && e->asset_id == asset_id; e++) {
            check(!e->claimed, "Already claimed");
            asset real = _token_balance(e->token_contract);
            asset aloc = _balance_of(e->depositor, e->token_contract);
            int64_t min_amount = real.amount < aloc.amount
                                 ? real.amount : aloc.amount;
            check(min_amount >= e->token_amount.amount,
                "Insufficient funds for redeem");
            pendentes.push_back(e);
        }

        std::sort(pendentes.begin(), pendentes.end(), [&](auto& a, auto& b) {
            return _token_balance(a->token_contract).amount <
                   _token_balance(b->token_contract).amount;
        });

        for (auto& e : pendentes) {
            _debit_balance(e->depositor, e->token_contract, e->token_amount);
            _release_token(to, e->token_contract, e->token_amount, "redeem");
            idx.modify(e, same_payer, [&](auto& row) { row.claimed = true; });
        }

        action(
            permission_level{get_self(), "active"_n},
            ATOMICASSETS,
            "burnasset"_n,
            std::make_tuple(get_self(), asset_id)
        ).send();
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

    // ==========================================
    // on_reveal — ORNG callback (lootbox F3 stub)
    // ==========================================

    void bingoescrow_contract::on_reveal(uint64_t, eosio::checksum256) {
    }

} // namespace bingoescrow

// ==============================================
// apply() — dispatcher manual hibrido
// Filtra notificacoes por code em runtime
// (multi-token sem redeploy)
// ==============================================

extern "C" void apply(uint64_t receiver, uint64_t code, uint64_t action) {
    using namespace eosio;
    using namespace bingoescrow;

    // 1) Notificacoes de transfer (qualquer token)
    if (action == "transfer"_n.value) {
        name contract_name = name(code);

        // NFT atomicassets → receive_asset
        if (contract_name == ATOMICASSETS) {
            execute_action(name(receiver), name(code),
                           &bingoescrow_contract::receive_asset);
            return;
        }

        // Token → on_transfer
        execute_action(name(receiver), name(code),
                       &bingoescrow_contract::on_transfer);
        return;
    }

    // 2) logmint — capturar asset_id pos-mint
    if (action == "logmint"_n.value && name(code) == ATOMICASSETS) {
        execute_action(name(receiver), name(code),
                       &bingoescrow_contract::on_mint);
        return;
    }

    // 3) ORNG callback — lootbox (F3)
    if (action == "receiverand"_n.value && name(code) == ORNG_CONTRACT) {
        execute_action(name(receiver), name(code),
                       &bingoescrow_contract::on_reveal);
        return;
    }

    // 4) Acoes internas do contrato (code == receiver)
    if (code == receiver) {
        switch (action) {
            case "init"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::init);
                break;
            case "setconfig"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::setconfig);
                break;
            case "settoken"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::settoken);
                break;
            case "settierprice"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::settierprice);
                break;
            case "setbacking"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::setbacking);
                break;
            case "setaccpay"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::setaccpay);
                break;
            case "releaseburn"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::releaseburn);
                break;
            case "addbacking"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::addbacking);
                break;
            case "cancelback"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::cancelback);
                break;
            case "rescueasset"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::rescueasset);
                break;
            case "adminrescue"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::adminrescue);
                break;
            case "withdraw"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::withdraw);
                break;
            case "adminrel"_n.value:
                execute_action(name(receiver), name(code),
                               &bingoescrow_contract::adminrel);
                break;
        }
    }
}
