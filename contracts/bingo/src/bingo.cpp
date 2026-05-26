#include <bingo.hpp>

namespace bingo {

    // ==========================================
    // CONFIGURAÇÃO
    // ==========================================

    void bingo_contract::setconfig(public_key signer_key) {
        require_auth(get_self());
        config_singleton config_table(get_self(), get_self().value);
        config_state config = { signer_key };
        config_table.set(config, get_self());
    }

    // ==========================================
    // FSM — CRIAÇÃO E ABERTURA DE VENDAS
    // ==========================================

    /**
     * Cria um novo jogo no estado CREATED.
     * O estado CREATED representa um jogo agendado, ainda não aberto para vendas.
     * A transição para FUNDING ocorre via fundgame() — chamada pelo worker no momento certo.
     * Ref: SPEC.md §1.2, architecture.md FSM
     */
    void bingo_contract::creategame(uint64_t game_id, extended_asset ticket_price, uint64_t gametype_id) {
        require_auth(get_self());
        games_table games(get_self(), get_self().value);
        check(games.find(game_id) == games.end(), "Game ID already exists.");

        if (gametype_id != 0) {
            gametypes_table gametypes(get_self(), get_self().value);
            check(gametypes.find(gametype_id) != gametypes.end(), "gametype_id nao encontrado.");
        }

        games.emplace(get_self(), [&](auto& g) {
            g.game_id      = game_id;
            g.status       = "created"_n;  // CREATED — aguarda fundgame()
            g.ticket_price = ticket_price;
            g.prize_pool   = extended_asset(asset(0, ticket_price.quantity.symbol), ticket_price.contract);
            g.gametype_id  = gametype_id;
            g.end_time     = time_point_sec(0);
        });
    }

    /**
     * CREATED → FUNDING: abre as vendas de cartelas.
     * Chamada pelo worker após o agendamento da rodada.
     * Auth: microservice (o worker que orquestra o ciclo de vida)
     */
    void bingo_contract::fundgame(uint64_t game_id) {
        require_auth("microservice"_n);
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "created"_n, "Game is not in CREATED status.");
        games.modify(game_itr, same_payer, [&](auto& g) { g.status = "funding"_n; });
    }

    // ==========================================
    // GESTÃO DE NFTs
    // ==========================================

    void bingo_contract::setnftconf(int32_t template_id, uint8_t discount_pct, bool is_vip, uint32_t valid_until) {
        require_auth(get_self());
        check(discount_pct <= 100, "Desconto maximo e 100%");
        nftconfigs_table _configs(get_self(), get_self().value);
        auto itr = _configs.find(template_id);
        if (itr == _configs.end()) {
            _configs.emplace(get_self(), [&](auto& row) {
                row.template_id = template_id; row.discount_pct = discount_pct;
                row.is_vip = is_vip; row.valid_until = valid_until;
            });
        } else {
            _configs.modify(itr, get_self(), [&](auto& row) {
                row.discount_pct = discount_pct; row.is_vip = is_vip; row.valid_until = valid_until;
            });
        }
    }

    void bingo_contract::delnftconf(int32_t template_id) {
        require_auth(get_self());
        nftconfigs_table _configs(get_self(), get_self().value);
        auto itr = _configs.require_find(template_id, "Template ID nao encontrado.");
        _configs.erase(itr);
    }

    // ==========================================
    // ADR-004 FASE 2 — PADRÕES DINÂMICOS
    // ==========================================

    void bingo_contract::addpattern(uint64_t pattern_id, std::string name, uint32_t mask) {
        require_auth(get_self());
        check(mask > 0, "mask deve ser maior que zero.");
        check(mask < (1u << 25), "mask nao pode exceder 25 bits (cartela 5x5).");
        check(name.size() <= 64, "name muito longo (max 64 chars).");
        patterns_table patterns(get_self(), get_self().value);
        auto itr = patterns.find(pattern_id);
        if (itr == patterns.end()) {
            patterns.emplace(get_self(), [&](auto& row) {
                row.pattern_id = pattern_id; row.name = name; row.mask = mask;
            });
        } else {
            patterns.modify(itr, get_self(), [&](auto& row) {
                row.name = name; row.mask = mask;
            });
        }
    }

    void bingo_contract::delpattern(uint64_t pattern_id) {
        require_auth(get_self());
        patterns_table patterns(get_self(), get_self().value);
        patterns.erase(patterns.require_find(pattern_id, "pattern_id nao encontrado."));
    }

    void bingo_contract::addgametype(uint64_t gametype_id, std::string name, uint8_t base_multiplier, std::vector<pattern_rule> rules) {
        require_auth(get_self());
        check(base_multiplier > 0, "base_multiplier deve ser maior que zero.");
        check(rules.size() > 0 && rules.size() <= 12, "rules: 1 a 12 elementos.");
        check(name.size() <= 64, "name muito longo (max 64 chars).");
        patterns_table patterns(get_self(), get_self().value);
        for (const auto& rule : rules) {
            check(patterns.find(rule.pattern_id) != patterns.end(),
                "pattern_id " + std::to_string(rule.pattern_id) + " nao encontrado.");
            check(rule.weight > 0, "weight deve ser maior que zero.");
        }
        gametypes_table gametypes(get_self(), get_self().value);
        auto itr = gametypes.find(gametype_id);
        if (itr == gametypes.end()) {
            gametypes.emplace(get_self(), [&](auto& row) {
                row.gametype_id = gametype_id; row.name = name;
                row.base_multiplier = base_multiplier; row.rules = rules;
            });
        } else {
            gametypes.modify(itr, get_self(), [&](auto& row) {
                row.name = name; row.base_multiplier = base_multiplier; row.rules = rules;
            });
        }
    }

    void bingo_contract::delgametype(uint64_t gametype_id) {
        require_auth(get_self());
        gametypes_table gametypes(get_self(), get_self().value);
        gametypes.erase(gametypes.require_find(gametype_id, "gametype_id nao encontrado."));
    }

    // ==========================================
    // DEPÓSITO (on_notify)
    // Reconhece memo "campaign:{id}" para registrar budget de campanha B2B.
    // Ref: SPEC.md §1.4
    // ==========================================

    void bingo_contract::deposit(name from, name to, eosio::asset quantity, std::string memo) {
        if (from == get_self() || to != get_self()) return;

        name token_contract = get_first_receiver();
        check(quantity.amount > 0, "A quantidade deve ser maior que zero.");

        extended_asset deposit_asset(quantity, token_contract);

        // ── Depósito de campanha B2B ──────────────────────────────────────────
        // Memo format: "campaign:{campaign_id}"
        const std::string CAMP_PREFIX = "campaign:";
        if (memo.rfind(CAMP_PREFIX, 0) == 0) {
            std::string id_str = memo.substr(CAMP_PREFIX.size());
            uint64_t campaign_id = std::stoull(id_str);

            campaigns_table campaigns(get_self(), get_self().value);
            auto camp_itr = campaigns.find(campaign_id);

            if (camp_itr == campaigns.end()) {
                // Cria nova campanha — payout_per_game será configurado via linkcampaign()
                campaigns.emplace(get_self(), [&](auto& c) {
                    c.campaign_id       = campaign_id;
                    c.sponsor           = from;
                    c.total_budget      = deposit_asset;
                    c.payout_per_game   = extended_asset(asset(0, quantity.symbol), token_contract);
                    c.balance_remaining = deposit_asset;
                    c.leftover_policy   = "refund"_n; // Default: devolve ao sponsor
                });
            } else {
                // Adiciona ao budget existente
                check(camp_itr->sponsor == from, "Apenas o sponsor original pode adicionar fundos.");
                campaigns.modify(camp_itr, same_payer, [&](auto& c) {
                    c.total_budget      += deposit_asset;
                    c.balance_remaining += deposit_asset;
                });
            }
            return;
        }

        // ── Depósito de jogador (wallet interna) ──────────────────────────────
        balances_table balances(get_self(), from.value);
        auto bal_itr = balances.find(deposit_asset.quantity.symbol.code().raw());
        if (bal_itr == balances.end()) {
            balances.emplace(get_self(), [&](auto& b) { b.balance = deposit_asset; });
        } else {
            balances.modify(bal_itr, get_self(), [&](auto& b) { b.balance += deposit_asset; });
        }
    }

    // ==========================================
    // BUY TICKETS
    // ==========================================

    void bingo_contract::buytickets(name buyer, uint64_t game_id, std::vector<std::vector<char>> matrices, std::vector<signature> signatures, uint64_t nft_id) {
        require_auth(buyer);

        games_table games(get_self(), get_self().value);
        auto game_itr = games.find(game_id);
        check(game_itr != games.end(), "Game not found.");
        check(game_itr->status == "funding"_n, "Game is not in FUNDING status.");
        check(matrices.size() == signatures.size(), "Matrices and signatures size mismatch.");
        check(matrices.size() > 0, "No matrices provided.");

        config_singleton config_table(get_self(), get_self().value);
        check(config_table.exists(), "Contract configuration not initialized.");
        auto config = config_table.get();

        tickets_table tickets(get_self(), game_id);

        extended_asset total_cost = game_itr->ticket_price;
        total_cost.quantity.amount *= (int64_t)matrices.size();

        if (total_cost.quantity.amount > 0) {
            if (nft_id != 0) {
                atomic_assets_table buyer_nfts("atomicassets"_n, buyer.value);
                auto nft_itr = buyer_nfts.require_find(nft_id, "NFT nao pertence a sua carteira.");
                check(nft_itr->collection_name == "cryptobingo"_n, "NFT nao pertence a colecao oficial.");
                nftconfigs_table _configs(get_self(), get_self().value);
                auto conf_itr = _configs.find(nft_itr->template_id);
                if (conf_itr != _configs.end()) {
                    if (conf_itr->valid_until > 0) {
                        check(current_time_point().sec_since_epoch() <= conf_itr->valid_until, "Utilidade do NFT expirou.");
                    }
                    if (conf_itr->discount_pct > 0) {
                        int64_t discount = (total_cost.quantity.amount * conf_itr->discount_pct) / 100;
                        total_cost.quantity.amount -= discount;
                    }
                }
            }

            balances_table balances(get_self(), buyer.value);
            auto bal_itr = balances.require_find(total_cost.quantity.symbol.code().raw(), "Saldo insuficiente: Token nao registrado.");
            check(bal_itr->balance >= total_cost, "Saldo insuficiente.");
            balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance -= total_cost; });
            games.modify(game_itr, get_self(), [&](auto& g) { g.prize_pool += total_cost; });
        }

        for (size_t i = 0; i < matrices.size(); ++i) {
            size_t buffer_size = eosio::pack_size(matrices[i]) + sizeof(uint64_t) + sizeof(name);
            std::vector<char> buffer(buffer_size);
            datastream<char*> ds(buffer.data(), buffer.size());
            ds << matrices[i] << game_id << buyer;
            auto hash = eosio::sha256(buffer.data(), buffer.size());
            assert_recover_key(hash, signatures[i], config.signer_key);

            uint64_t generated_ticket_id;
            auto hash_array = hash.extract_as_byte_array();
            memcpy(&generated_ticket_id, hash_array.data(), sizeof(uint64_t));
            check(tickets.find(generated_ticket_id) == tickets.end(), "Ticket signature replay detected.");

            tickets.emplace(buyer, [&](auto& t) {
                t.ticket_id = generated_ticket_id;
                t.owner     = buyer;
                t.matrix    = matrices[i];
                t.state     = 0x00001000; // Bit 12 = FREE SPACE pré-setado
                t.game_id   = game_id;
            });
        }
    }

    // ==========================================
    // FSM — TRANSIÇÕES INTERMEDIÁRIAS
    // ==========================================

    void bingo_contract::lockgame(uint64_t game_id) {
        require_auth("microservice"_n);
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "funding"_n, "Game is not in FUNDING status.");
        games.modify(game_itr, same_payer, [&](auto& g) { g.status = "locked"_n; });
    }

    void bingo_contract::startdraw(uint64_t game_id) {
        require_auth("microservice"_n);
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "locked"_n, "Game is not in LOCKED status.");
        games.modify(game_itr, same_payer, [&](auto& g) { g.status = "drawing"_n; });
        action(
            permission_level{get_self(), "active"_n},
            "orng.wax"_n, "requestrand"_n,
            std::make_tuple(game_id, (uint64_t)0, get_self())
        ).send();
    }

    void bingo_contract::receiverand(uint64_t assoc_id, std::vector<char> random_bytes) {
        require_auth("orng.wax"_n);
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(assoc_id, "Game not found for Oracle response.");
        check(game_itr->status == "drawing"_n, "Game is not in DRAWING status.");
        games.modify(game_itr, same_payer, [&](auto& g) {
            g.drawn_balls = random_bytes;
            g.status      = "drawn"_n;
        });
    }

    // ==========================================
    // CLAIM WIN — DRAWN → ARCHIVED (ADR-005 Fase 2)
    // Seta end_time para base da quarentena de 24h (SPEC.md §5.1)
    // ==========================================

    void bingo_contract::claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask) {
        require_auth("microservice"_n);

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "drawn"_n, "Game is not in DRAWN status.");

        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.require_find(ticket_id, "Ticket not found.");

        name winner = ticket_itr->owner;
        balances_table balances(get_self(), winner.value);
        extended_asset payout;

        if (game_itr->gametype_id == 0) {
            // Modo legado: RTP fixo 85%
            payout = game_itr->prize_pool;
            payout.quantity.amount = (payout.quantity.amount * 85) / 100;
        } else {
            // Modo dinâmico: ticket_price * base_multiplier * win_weight (ADR-005 Fase 2)
            gametypes_table gametypes(get_self(), get_self().value);
            auto gt_itr = gametypes.require_find(game_itr->gametype_id, "gametype_id invalido no jogo.");
            uint8_t win_weight = 0;
            for (const auto& rule : gt_itr->rules) {
                patterns_table patterns(get_self(), get_self().value);
                auto pat_itr = patterns.find(rule.pattern_id);
                if (pat_itr != patterns.end() && (uint64_t)pat_itr->mask == win_pattern_mask) {
                    win_weight = rule.weight;
                    break;
                }
            }
            check(win_weight > 0, "win_pattern_mask nao corresponde a nenhum padrao do gametype.");
            payout = game_itr->ticket_price;
            payout.quantity.amount =
                payout.quantity.amount * (int64_t)gt_itr->base_multiplier * (int64_t)win_weight;
        }

        if (payout.quantity.amount > 0) {
            auto bal_itr = balances.find(payout.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = payout; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += payout; });
            }
        }

        // Multidrop: distribui sponsor_pool integralmente ao vencedor
        for (const auto& sponsor_asset : game_itr->sponsor_pool) {
            if (sponsor_asset.quantity.amount > 0) {
                auto sb_itr = balances.find(sponsor_asset.quantity.symbol.code().raw());
                if (sb_itr == balances.end()) {
                    balances.emplace(get_self(), [&](auto& b) { b.balance = sponsor_asset; });
                } else {
                    balances.modify(sb_itr, same_payer, [&](auto& b) { b.balance += sponsor_asset; });
                }
            }
        }

        // DRAWN → ARCHIVED + registra end_time para GC de 24h
        games.modify(game_itr, same_payer, [&](auto& g) {
            g.status   = "archived"_n;
            g.end_time = time_point_sec(current_time_point().sec_since_epoch());
        });
    }

    // ==========================================
    // ABORT GAME — Fail-Safe (SPEC.md §5.2, COMPLIANCE.md §4)
    // Transita para ABORTED e seta end_time.
    // Após isso, refundticket() fica liberado para estornos O(1).
    // Auth: microservice (timeout do oráculo) ou get_self() (admin halt)
    // ==========================================

    void bingo_contract::abortgame(uint64_t game_id, std::string reason) {
        // Aceita tanto o microservice (timeout do oráculo) quanto o admin (halt manual)
        bool by_ms    = has_auth("microservice"_n);
        bool by_admin = has_auth(get_self());
        check(by_ms || by_admin, "Auth: microservice ou " + get_self().to_string() + " necessaria.");

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");

        // Pode abortar a partir de LOCKED ou DRAWING
        check(
            game_itr->status == "locked"_n || game_itr->status == "drawing"_n,
            "Game deve estar em LOCKED ou DRAWING para ser abortado."
        );

        games.modify(game_itr, same_payer, [&](auto& g) {
            g.status   = "aborted"_n;
            g.end_time = time_point_sec(current_time_point().sec_since_epoch());
        });
    }

    // ==========================================
    // REFUND TICKET — Estorno O(1) (SPEC.md §5.2)
    // Callable por qualquer um quando status = ABORTED.
    // Devolve ticket_price ao owner e apaga a linha (libera RAM).
    // ==========================================

    void bingo_contract::refundticket(uint64_t game_id, uint64_t ticket_id) {
        // Não exige auth específica — qualquer conta pode acionar o estorno
        // para proteger o jogador mesmo que a plataforma esteja offline.
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "aborted"_n, "Estorno so disponivel para jogos ABORTED.");

        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.require_find(ticket_id, "Ticket not found.");

        name owner = ticket_itr->owner;

        // Estorna o ticket_price para a wallet interna do owner
        if (game_itr->ticket_price.quantity.amount > 0) {
            balances_table balances(get_self(), owner.value);
            auto bal_itr = balances.find(game_itr->ticket_price.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = game_itr->ticket_price; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += game_itr->ticket_price; });
            }
        }

        // Apaga o ticket — libera RAM imediatamente (O(1))
        tickets.erase(ticket_itr);
    }

    // ==========================================
    // CLEAR GAME — Garbage Collection (SPEC.md §5.1)
    // Apaga tickets em lote após quarentena de 24h.
    // max_rows limita a iteração ao budget de CPU do bloco WAX (~30ms).
    // Deve ser chamado repetidamente até não haver mais rows.
    // ==========================================

    void bingo_contract::cleargame(uint64_t game_id, uint32_t max_rows) {
        // Qualquer conta pode chamar — incentiva a desalocação de RAM
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");

        check(
            game_itr->status == "archived"_n || game_itr->status == "aborted"_n,
            "cleargame: jogo deve estar em ARCHIVED ou ABORTED."
        );

        // Valida quarentena de 24h (apenas para ARCHIVED — não aplica a ABORTED)
        if (game_itr->status == "archived"_n) {
            uint32_t now       = current_time_point().sec_since_epoch();
            uint32_t end_ts    = game_itr->end_time.sec_since_epoch();
            uint32_t quarantine = 24 * 3600;
            check(end_ts > 0, "end_time nao registrado. Execute claimwin primeiro.");
            check(now >= end_ts + quarantine,
                "Quarentena de 24h ainda nao expirou. Aguarde " +
                std::to_string((end_ts + quarantine) - now) + " segundos."
            );
        }

        tickets_table tickets(get_self(), game_id);
        uint32_t erased = 0;

        auto itr = tickets.begin();
        while (itr != tickets.end() && erased < max_rows) {
            itr = tickets.erase(itr);
            erased++;
        }

        // Se não restam tickets, remove o jogo também
        if (tickets.begin() == tickets.end()) {
            games.erase(game_itr);
        }
    }

    // ==========================================
    // PATROCÍNIO B2B — linkcampaign / closecampaign (SPEC.md §1.4)
    // ==========================================

    /**
     * Vincula uma campanha a um jogo, injetando payout_per_game no sponsor_pool.
     * O jogo deve estar em CREATED ou FUNDING (antes de LOCKED).
     * Auth: get_self() (admin) ou o próprio sponsor
     */
    void bingo_contract::linkcampaign(uint64_t game_id, uint64_t campaign_id) {
        campaigns_table campaigns(get_self(), get_self().value);
        auto camp_itr = campaigns.require_find(campaign_id, "campaign_id nao encontrado.");

        bool by_admin   = has_auth(get_self());
        bool by_sponsor = has_auth(camp_itr->sponsor);
        check(by_admin || by_sponsor, "Auth: admin ou sponsor necessaria.");

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(
            game_itr->status == "created"_n || game_itr->status == "funding"_n,
            "linkcampaign: jogo deve estar em CREATED ou FUNDING."
        );

        // payout_per_game deve ter sido configurado (amount > 0)
        check(camp_itr->payout_per_game.quantity.amount > 0,
            "payout_per_game nao configurado. Use closecampaign para definir.");
        check(camp_itr->balance_remaining >= camp_itr->payout_per_game,
            "Saldo insuficiente na campanha para vincular mais um jogo.");

        // Injeta payout_per_game no sponsor_pool do jogo
        games.modify(game_itr, same_payer, [&](auto& g) {
            bool found = false;
            for (auto& sp : g.sponsor_pool) {
                if (sp.quantity.symbol == camp_itr->payout_per_game.quantity.symbol
                    && sp.contract == camp_itr->payout_per_game.contract) {
                    sp += camp_itr->payout_per_game;
                    found = true;
                    break;
                }
            }
            if (!found) g.sponsor_pool.push_back(camp_itr->payout_per_game);
            g.campaign_id = campaign_id;
        });

        // Debita o payout_per_game do saldo restante da campanha
        campaigns.modify(camp_itr, same_payer, [&](auto& c) {
            c.balance_remaining -= c.payout_per_game;
            c.games_linked++;
        });
    }

    /**
     * Liquida o saldo residual da campanha conforme leftover_policy.
     * "refund"_n → devolve ao sponsor; "house"_n → fica na tesouraria.
     * Auth: get_self() ou sponsor
     */
    void bingo_contract::closecampaign(uint64_t campaign_id) {
        campaigns_table campaigns(get_self(), get_self().value);
        auto camp_itr = campaigns.require_find(campaign_id, "campaign_id nao encontrado.");

        bool by_admin   = has_auth(get_self());
        bool by_sponsor = has_auth(camp_itr->sponsor);
        check(by_admin || by_sponsor, "Auth: admin ou sponsor necessaria.");

        if (camp_itr->balance_remaining.quantity.amount > 0) {
            if (camp_itr->leftover_policy == "refund"_n) {
                // Devolve ao sponsor via transfer
                action(
                    permission_level{get_self(), "active"_n},
                    camp_itr->balance_remaining.contract,
                    "transfer"_n,
                    std::make_tuple(
                        get_self(),
                        camp_itr->sponsor,
                        camp_itr->balance_remaining.quantity,
                        std::string("Saldo residual campanha " + std::to_string(campaign_id))
                    )
                ).send();
            }
            // leftover_policy == "house": permanece na conta do contrato (tesouraria)
        }

        campaigns.erase(camp_itr);
    }

    // ==========================================
    // WITHDRAW
    // ==========================================

    void bingo_contract::withdraw(name owner, extended_asset amount) {
        require_auth(owner);
        balances_table balances(get_self(), owner.value);
        auto bal_itr = balances.require_find(amount.quantity.symbol.code().raw(), "Nenhum saldo para este token.");
        check(bal_itr->balance >= amount, "Saldo insuficiente.");
        balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance -= amount; });
        action(
            permission_level{get_self(), "active"_n},
            amount.contract, "transfer"_n,
            std::make_tuple(get_self(), owner, amount.quantity, std::string("Saque via CryptoBingo"))
        ).send();
    }
}
