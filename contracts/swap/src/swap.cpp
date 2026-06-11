#include <swap.hpp>

namespace swap_contract_ns {

    // ──────────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────────

    // Raiz quadrada inteira via método Babylônico.
    // Usada na inicialização do pool para LP = sqrt(a * b).
    int64_t swap_contract::_isqrt(int128_t n) {
        if (n <= 0) return 0;
        int128_t x = n;
        int128_t y = (x + 1) / 2;
        while (y < x) {
            x = y;
            y = (x + n / x) / 2;
        }
        return (int64_t)x;
    }

    // Fórmula x*y=k: calcula amount_out dado amount_in descontando a taxa.
    // amount_in_eff = amount_in * (10000 - fee_bps)
    // amount_out    = reserve_out * amount_in_eff / (reserve_in * 10000 + amount_in_eff)
    int64_t swap_contract::_compute_out(int64_t reserve_in, int64_t reserve_out,
                                         int64_t amount_in, uint16_t fee_bps) {
        check(reserve_in > 0 && reserve_out > 0, "pool sem liquidez");
        check(amount_in  > 0, "amount_in deve ser positivo");
        int128_t eff    = (int128_t)amount_in * (10000 - fee_bps);
        int128_t numer  = (int128_t)reserve_out * eff;
        int128_t denom  = (int128_t)reserve_in  * 10000 + eff;
        return (int64_t)(numer / denom);
    }

    pool_record swap_contract::_get_pool(uint64_t pool_id) {
        pools_table pools(get_self(), get_self().value);
        auto it = pools.find(pool_id);
        check(it != pools.end(), "pool não encontrado");
        return *it;
    }

    void swap_contract::_save_pool(pool_record& pool) {
        pools_table pools(get_self(), get_self().value);
        auto it = pools.find(pool.pool_id);
        check(it != pools.end(), "pool não encontrado");
        pools.modify(it, same_payer, [&](auto& r) { r = pool; });
    }

    bool swap_contract::_is_sym_a(const pool_record& pool, name contract, symbol sym) const {
        return pool.sym_a.get_contract() == contract && pool.sym_a.get_symbol() == sym;
    }

    // Verifica se o extended_symbol (contract + symbol) está na allowlist de tokens aprovados.
    // A chave do índice secundário combina os 64 bits do contract.value com os 64 bits do
    // symbol_code.raw(), garantindo unicidade total sem risco de colisão.
    bool swap_contract::_is_allowed(extended_symbol sym) const {
        allowed_tokens_table allowed(get_self(), get_self().value);
        auto by_sym = allowed.get_index<"bysym"_n>();
        uint128_t key = ((uint128_t)sym.get_contract().value << 64)
                      |  (uint64_t)sym.get_symbol().code().raw();
        return by_sym.find(key) != by_sym.end();
    }

    std::vector<std::string> swap_contract::_split(const std::string& s, char delim) {
        std::vector<std::string> out;
        std::string tok;
        for (char c : s) {
            if (c == delim) { out.push_back(tok); tok.clear(); }
            else             { tok += c; }
        }
        out.push_back(tok);
        return out;
    }

    // ──────────────────────────────────────────────
    // CONFIGURAÇÃO — settreasury / setpoolfee
    // ──────────────────────────────────────────────

    void swap_contract::settreasury(name account) {
        require_auth(get_self());
        check(is_account(account), "conta treasury inválida");
        swap_state_singleton ss(get_self(), get_self().value);
        swap_state state = ss.exists() ? ss.get() : swap_state{};
        state.treasury = account;
        ss.set(state, get_self());
    }

    // service_fee_bps é deduzida do amount_in ANTES da fórmula AMM e enviada
    // à treasury. Assim os provedores de liquidez não são penalizados: o k
    // só vê o net_in (sem a fee), mantendo a fórmula justa.
    void swap_contract::setpoolfee(uint64_t pool_id, uint16_t service_fee_bps) {
        require_auth(get_self());
        check(service_fee_bps <= 500, "service_fee_bps máximo 500 (5%)");
        pools_table pools(get_self(), get_self().value);
        auto it = pools.find(pool_id);
        check(it != pools.end(), "pool não encontrado");
        pools.modify(it, same_payer, [&](auto& r) {
            r.service_fee_bps = service_fee_bps;
        });
    }

    // ──────────────────────────────────────────────
    // ALLOWLIST — addtoken / deltoken
    // ──────────────────────────────────────────────

    void swap_contract::addtoken(extended_symbol sym) {
        require_auth(get_self());
        check(sym.get_symbol().is_valid(),       "símbolo inválido");
        check(is_account(sym.get_contract()),    "contrato de token inexistente na chain");
        check(!_is_allowed(sym),                 "token já está na allowlist");

        swap_state_singleton ss(get_self(), get_self().value);
        swap_state state = ss.exists() ? ss.get() : swap_state{};

        allowed_tokens_table allowed(get_self(), get_self().value);
        allowed.emplace(get_self(), [&](auto& r) {
            r.id  = state.next_token_id++;
            r.sym = sym;
        });
        ss.set(state, get_self());
    }

    void swap_contract::deltoken(extended_symbol sym) {
        require_auth(get_self());

        allowed_tokens_table allowed(get_self(), get_self().value);
        auto by_sym = allowed.get_index<"bysym"_n>();
        uint128_t key = ((uint128_t)sym.get_contract().value << 64)
                      |  (uint64_t)sym.get_symbol().code().raw();
        auto it = by_sym.find(key);
        check(it != by_sym.end(), "token não encontrado na allowlist");
        by_sym.erase(it);
    }

    // ──────────────────────────────────────────────
    // CREATEPOOL
    // ──────────────────────────────────────────────

    void swap_contract::createpool(name creator, extended_symbol sym_a,
                                    extended_symbol sym_b, uint16_t fee_bps) {
        require_auth(creator);
        check(fee_bps <= 1000, "fee_bps máximo 1000 (10%)");
        check(sym_a != sym_b,  "os dois tokens do par devem ser distintos");

        // Ambos os tokens devem ser previamente aprovados pelo admin.
        // Isso previne fake-token injection: um atacante não pode criar pools
        // com tokens arbitrários — apenas os (contract, symbol) da allowlist são aceitos.
        check(_is_allowed(sym_a), "token A não está na allowlist de tokens aprovados");
        check(_is_allowed(sym_b), "token B não está na allowlist de tokens aprovados");

        // Ordem canônica: menor symbol_code.raw() primeiro.
        // Em caso de empate de código, usa contract.value como desempate.
        uint64_t code_a = sym_a.get_symbol().code().raw();
        uint64_t code_b = sym_b.get_symbol().code().raw();
        if (code_a > code_b || (code_a == code_b && sym_a.get_contract().value > sym_b.get_contract().value)) {
            std::swap(sym_a, sym_b);
        }

        // Garante que o par (sym_a, sym_b) ainda não tem pool.
        pools_table pools(get_self(), get_self().value);
        auto by_pair = pools.get_index<"bypair"_n>();
        uint128_t pair_key = ((uint128_t)sym_a.get_symbol().code().raw() << 64)
                           |  (uint64_t)sym_b.get_symbol().code().raw();
        auto it = by_pair.lower_bound(pair_key);
        while (it != by_pair.end() &&
               (((uint128_t)it->sym_a.get_symbol().code().raw() << 64) |
                 (uint64_t)it->sym_b.get_symbol().code().raw()) == pair_key) {
            check(!(it->sym_a.get_contract() == sym_a.get_contract() &&
                    it->sym_b.get_contract() == sym_b.get_contract()),
                  "pool para este par já existe");
            ++it;
        }

        swap_state_singleton ss(get_self(), get_self().value);
        swap_state state = ss.exists() ? ss.get() : swap_state{};
        uint64_t pool_id = state.next_pool_id++;
        ss.set(state, get_self());

        pools.emplace(creator, [&](auto& r) {
            r.pool_id          = pool_id;
            r.sym_a            = sym_a;
            r.sym_b            = sym_b;
            r.reserve_a        = 0;
            r.reserve_b        = 0;
            r.lp_supply        = 0;
            r.fee_bps          = fee_bps;
            r.service_fee_bps  = 0;  // admin configura via setpoolfee
        });
    }

    // ──────────────────────────────────────────────
    // ON_TRANSFER — depósito pendente ou swap direto
    // ──────────────────────────────────────────────

    void swap_contract::on_transfer(name from, name to, asset quantity, std::string memo) {
        if (from == get_self() || to != get_self()) return;
        if (from == "eosio"_n || from == "eosio.stake"_n || from == "eosio.ram"_n) return;

        check(quantity.amount > 0, "quantidade inválida");

        auto parts = _split(memo, ',');
        check(parts.size() >= 2,
              "memo inválido; use 'deposit,<pool_id>' ou 'swap,<pool_id>,<min_out>[,<to>]'");

        name     token_contract = get_first_receiver();
        uint64_t pool_id        = std::stoull(parts[1]);

        if (parts[0] == "deposit") {
            pool_record pool = _get_pool(pool_id);
            bool is_a = _is_sym_a(pool, token_contract, quantity.symbol);
            bool is_b = pool.sym_b.get_contract() == token_contract &&
                        pool.sym_b.get_symbol()   == quantity.symbol;
            check(is_a || is_b, "token não pertence a este pool");

            pending_table pending(get_self(), from.value);
            auto it = pending.find(pool_id);

            if (it == pending.end()) {
                pending.emplace(get_self(), [&](auto& r) {
                    r.pool_id    = pool_id;
                    r.deposit_a  = extended_asset{asset{0, pool.sym_a.get_symbol()}, pool.sym_a.get_contract()};
                    r.deposit_b  = extended_asset{asset{0, pool.sym_b.get_symbol()}, pool.sym_b.get_contract()};
                    r.expires_at = (uint32_t)(current_time_point().sec_since_epoch() + 600);
                    if (is_a) r.deposit_a.quantity.amount = quantity.amount;
                    else      r.deposit_b.quantity.amount = quantity.amount;
                });
            } else {
                if (is_a) {
                    check(it->deposit_a.quantity.amount == 0,
                          "token A já depositado; chame canceldep antes de refazer");
                    pending.modify(it, same_payer, [&](auto& r) {
                        r.deposit_a.quantity.amount = quantity.amount;
                        r.expires_at = (uint32_t)(current_time_point().sec_since_epoch() + 600);
                    });
                } else {
                    check(it->deposit_b.quantity.amount == 0,
                          "token B já depositado; chame canceldep antes de refazer");
                    pending.modify(it, same_payer, [&](auto& r) {
                        r.deposit_b.quantity.amount = quantity.amount;
                        r.expires_at = (uint32_t)(current_time_point().sec_since_epoch() + 600);
                    });
                }
            }

        } else if (parts[0] == "swap") {
            check(parts.size() >= 3,
                  "memo swap inválido; use 'swap,<pool_id>,<min_out>[,<to>]'");

            int64_t min_out   = std::stoll(parts[2]);
            name    recipient = (parts.size() >= 4 && !parts[3].empty()) ? name(parts[3]) : from;
            check(is_account(recipient), "destinatário inválido");

            pool_record pool = _get_pool(pool_id);
            bool is_a = _is_sym_a(pool, token_contract, quantity.symbol);
            bool is_b = pool.sym_b.get_contract() == token_contract &&
                        pool.sym_b.get_symbol()   == quantity.symbol;
            check(is_a || is_b, "token não pertence a este pool");

            // Deduz a service fee do amount_in ANTES da fórmula AMM.
            // A fee vai para a treasury; o pool só vê o net_in → k não é inflacionado.
            int64_t service_fee_amount = 0;
            if (pool.service_fee_bps > 0) {
                service_fee_amount = (int64_t)((int128_t)quantity.amount * pool.service_fee_bps / 10000);
            }
            int64_t net_amount_in = quantity.amount - service_fee_amount;
            check(net_amount_in > 0, "amount_in insuficiente após dedução da service fee");

            int64_t reserve_in  = is_a ? pool.reserve_a : pool.reserve_b;
            int64_t reserve_out = is_a ? pool.reserve_b : pool.reserve_a;
            int64_t amount_out  = _compute_out(reserve_in, reserve_out, net_amount_in, pool.fee_bps);

            check(amount_out >= min_out,    "slippage excedido");
            check(amount_out < reserve_out, "liquidez insuficiente para este swap");

            // Salva reservas com net_amount_in ANTES das inline actions.
            if (is_a) { pool.reserve_a += net_amount_in; pool.reserve_b -= amount_out; }
            else       { pool.reserve_b += net_amount_in; pool.reserve_a -= amount_out; }
            _save_pool(pool);

            // Envia a service fee para a treasury (se houver).
            if (service_fee_amount > 0) {
                swap_state_singleton ss(get_self(), get_self().value);
                name treasury = ss.exists() ? ss.get().treasury : "bingogamectr"_n;
                action(
                    permission_level{get_self(), "active"_n},
                    token_contract,
                    "transfer"_n,
                    std::make_tuple(get_self(), treasury, asset{service_fee_amount, quantity.symbol},
                                    std::string("service fee pool " + std::to_string(pool_id)))
                ).send();
            }

            extended_symbol sym_out = is_a ? pool.sym_b : pool.sym_a;
            action(
                permission_level{get_self(), "active"_n},
                sym_out.get_contract(),
                "transfer"_n,
                std::make_tuple(get_self(), recipient, asset{amount_out, sym_out.get_symbol()},
                                std::string("bingogameswp"))
            ).send();

        } else {
            check(false, "memo inválido; use 'deposit,<pool_id>' ou 'swap,<pool_id>,<min_out>[,<to>]'");
        }
    }

    // ──────────────────────────────────────────────
    // ADDLIQ
    // ──────────────────────────────────────────────

    void swap_contract::addliq(name provider, uint64_t pool_id, int64_t min_lp) {
        require_auth(provider);

        pending_table pending(get_self(), provider.value);
        auto it = pending.find(pool_id);
        check(it != pending.end(),
              "nenhum depósito pendente; envie ambos os tokens com memo 'deposit,<pool_id>'");
        check(it->deposit_a.quantity.amount > 0, "depósito do token A ausente");
        check(it->deposit_b.quantity.amount > 0, "depósito do token B ausente");
        check(it->expires_at >= (uint32_t)current_time_point().sec_since_epoch(),
              "depósito expirado; chame canceldep e refaça");

        pool_record pool = _get_pool(pool_id);
        int64_t dep_a    = it->deposit_a.quantity.amount;
        int64_t dep_b    = it->deposit_b.quantity.amount;
        int64_t lp_issued, actual_a = dep_a, actual_b = dep_b;
        int64_t refund_a = 0, refund_b = 0;

        if (pool.lp_supply == 0) {
            // Pool vazio: LP = sqrt(a * b) - MINIMUM_LIQUIDITY.
            // As 1000 dead shares previnem o ataque de manipulação de preço inicial.
            lp_issued = _isqrt((int128_t)dep_a * dep_b);
            check(lp_issued > 1000, "liquidez inicial insuficiente; aumente os depósitos");
            lp_issued -= 1000;
        } else {
            // Usa o lado com menor contribuição proporcional para calcular LP emitido;
            // devolve o excesso do outro lado.
            int128_t lp_from_a = (int128_t)pool.lp_supply * dep_a / pool.reserve_a;
            int128_t lp_from_b = (int128_t)pool.lp_supply * dep_b / pool.reserve_b;

            if (lp_from_a <= lp_from_b) {
                lp_issued = (int64_t)lp_from_a;
                int64_t used_b = (int64_t)((int128_t)lp_issued * pool.reserve_b / pool.lp_supply);
                refund_b = dep_b - used_b;
                actual_b = used_b;
            } else {
                lp_issued = (int64_t)lp_from_b;
                int64_t used_a = (int64_t)((int128_t)lp_issued * pool.reserve_a / pool.lp_supply);
                refund_a = dep_a - used_a;
                actual_a = used_a;
            }
        }

        check(lp_issued >= min_lp, "slippage de LP excedido");
        check(lp_issued > 0,       "LP emitido seria zero");

        pool.reserve_a += actual_a;
        pool.reserve_b += actual_b;
        pool.lp_supply += lp_issued;
        _save_pool(pool);

        // Credita LP tokens ao provider.
        lp_balances_table lp_bal(get_self(), provider.value);
        auto it_lp = lp_bal.find(pool_id);
        if (it_lp == lp_bal.end()) {
            lp_bal.emplace(get_self(), [&](auto& r) { r.pool_id = pool_id; r.amount = lp_issued; });
        } else {
            lp_bal.modify(it_lp, same_payer, [&](auto& r) { r.amount += lp_issued; });
        }

        pending.erase(it);

        // Devolve excedentes.
        if (refund_a > 0) {
            action(permission_level{get_self(), "active"_n},
                   pool.sym_a.get_contract(), "transfer"_n,
                   std::make_tuple(get_self(), provider, asset{refund_a, pool.sym_a.get_symbol()},
                                   std::string("refund addliq"))).send();
        }
        if (refund_b > 0) {
            action(permission_level{get_self(), "active"_n},
                   pool.sym_b.get_contract(), "transfer"_n,
                   std::make_tuple(get_self(), provider, asset{refund_b, pool.sym_b.get_symbol()},
                                   std::string("refund addliq"))).send();
        }
    }

    // ──────────────────────────────────────────────
    // REMLIQ
    // ──────────────────────────────────────────────

    void swap_contract::remliq(name provider, uint64_t pool_id, int64_t lp_amount,
                                int64_t min_a, int64_t min_b) {
        require_auth(provider);
        check(lp_amount > 0, "lp_amount deve ser positivo");

        lp_balances_table lp_bal(get_self(), provider.value);
        auto it_lp = lp_bal.find(pool_id);
        check(it_lp != lp_bal.end() && it_lp->amount >= lp_amount, "saldo LP insuficiente");

        pool_record pool = _get_pool(pool_id);
        check(pool.lp_supply > 0, "pool sem liquidez");

        int64_t out_a = (int64_t)((int128_t)pool.reserve_a * lp_amount / pool.lp_supply);
        int64_t out_b = (int64_t)((int128_t)pool.reserve_b * lp_amount / pool.lp_supply);
        check(out_a >= min_a, "slippage do token A excedido");
        check(out_b >= min_b, "slippage do token B excedido");
        check(out_a > 0 && out_b > 0, "output zerado; lp_amount muito pequeno");

        pool.reserve_a -= out_a;
        pool.reserve_b -= out_b;
        pool.lp_supply -= lp_amount;
        _save_pool(pool);

        if (it_lp->amount == lp_amount) lp_bal.erase(it_lp);
        else lp_bal.modify(it_lp, same_payer, [&](auto& r) { r.amount -= lp_amount; });

        action(permission_level{get_self(), "active"_n},
               pool.sym_a.get_contract(), "transfer"_n,
               std::make_tuple(get_self(), provider, asset{out_a, pool.sym_a.get_symbol()},
                               std::string("remliq"))).send();

        action(permission_level{get_self(), "active"_n},
               pool.sym_b.get_contract(), "transfer"_n,
               std::make_tuple(get_self(), provider, asset{out_b, pool.sym_b.get_symbol()},
                               std::string("remliq"))).send();
    }

    // ──────────────────────────────────────────────
    // CANCELDEPOSIT
    // ──────────────────────────────────────────────

    void swap_contract::canceldep(name provider, uint64_t pool_id) {
        require_auth(provider);

        pending_table pending(get_self(), provider.value);
        auto it = pending.find(pool_id);
        check(it != pending.end(), "nenhum depósito pendente para este pool");

        pool_record pool = _get_pool(pool_id);

        if (it->deposit_a.quantity.amount > 0) {
            action(permission_level{get_self(), "active"_n},
                   pool.sym_a.get_contract(), "transfer"_n,
                   std::make_tuple(get_self(), provider, it->deposit_a.quantity,
                                   std::string("canceldep"))).send();
        }
        if (it->deposit_b.quantity.amount > 0) {
            action(permission_level{get_self(), "active"_n},
                   pool.sym_b.get_contract(), "transfer"_n,
                   std::make_tuple(get_self(), provider, it->deposit_b.quantity,
                                   std::string("canceldep"))).send();
        }

        pending.erase(it);
    }

}
