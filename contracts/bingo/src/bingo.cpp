#include <bingo.hpp>

namespace bingo {

    // ==========================================
    // HELPERS INTERNOS — Drop State
    // ==========================================

    drop_state bingo_contract::_get_drop_state() {
        drop_state_singleton ds_table(get_self(), get_self().value);
        drop_state ds;
        if (ds_table.exists()) {
            ds = ds_table.get();
        } else {
            ds.next_deposit_id        = 1;
            ds.next_alloc_id          = 1;
            ds.player_base_chance_bps = 5000;
        }
        return ds;
    }

    void bingo_contract::_save_drop_state(drop_state& ds) {
        drop_state_singleton ds_table(get_self(), get_self().value);
        ds_table.set(ds, get_self());
    }

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

    void bingo_contract::creategame(uint64_t game_id, extended_asset ticket_price, uint64_t gametype_id, uint64_t room_id) {
        require_auth(get_self());
        games_table games(get_self(), get_self().value);
        check(games.find(game_id) == games.end(), "Game ID already exists.");

        if (gametype_id != 0) {
            gametypes_table gametypes(get_self(), get_self().value);
            check(gametypes.find(gametype_id) != gametypes.end(), "gametype_id nao encontrado.");
        }

        // Se vinculado a uma sala, valida que ela existe e está ativa
        if (room_id != 0) {
            rooms_table rooms(get_self(), get_self().value);
            auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
            check(room_itr->status == "active"_n, "Sala nao esta ativa.");
            // Atualiza current_game_id da sala
            rooms.modify(room_itr, same_payer, [&](auto& r) {
                r.current_game_id = game_id;
            });
        }

        games.emplace(get_self(), [&](auto& g) {
            g.game_id      = game_id;
            g.status       = "created"_n;
            g.ticket_price = ticket_price;
            g.prize_pool   = extended_asset(asset(0, ticket_price.quantity.symbol), ticket_price.contract);
            g.gametype_id  = gametype_id;
            g.room_id      = room_id;
            g.end_time     = time_point_sec(0);
        });
    }

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
        _configs.erase(_configs.require_find(template_id, "Template ID nao encontrado."));
    }

    // ==========================================
    // ADR-004 FASE 2 — PADRÕES DINÂMICOS
    // ==========================================

    void bingo_contract::addpattern(uint64_t pattern_id, std::string name, uint32_t mask) {
        require_auth(get_self());
        check(mask > 0, "mask deve ser maior que zero.");
        check(mask < (1u << 25), "mask nao pode exceder 25 bits.");
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
        check(rules.size() > 0, "rules deve ter pelo menos 1 elemento.");
        check(name.size() <= 64, "name muito longo (max 64 chars).");
        patterns_table patterns(get_self(), get_self().value);
        for (const auto& rule : rules) {
            check(patterns.find(rule.pattern_id) != patterns.end(),
                "pattern_id " + std::to_string(rule.pattern_id) + " nao encontrado.");
            check(rule.weight > 0, "weight deve ser maior que zero.");
            check(rule.weight <= 25500, "weight max 255.00 (hundredths).");
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
    // DEPÓSITO (on_notify eosio.token)
    // ==========================================

    void bingo_contract::deposit(name from, name to, eosio::asset quantity, std::string memo) {
        if (from == get_self() || to != get_self()) return;

        name token_contract = get_first_receiver();
        check(quantity.amount > 0, "A quantidade deve ser maior que zero.");
        extended_asset deposit_asset(quantity, token_contract);

        // Memo: "campaign:{id}" → budget B2B
        const std::string CAMP_PREFIX = "campaign:";
        if (memo.rfind(CAMP_PREFIX, 0) == 0) {
            uint64_t campaign_id = std::stoull(memo.substr(CAMP_PREFIX.size()));
            campaigns_table campaigns(get_self(), get_self().value);
            auto camp_itr = campaigns.find(campaign_id);
            if (camp_itr == campaigns.end()) {
                campaigns.emplace(get_self(), [&](auto& c) {
                    c.campaign_id       = campaign_id;
                    c.sponsor           = from;
                    c.total_budget      = deposit_asset;
                    c.payout_per_game   = extended_asset(asset(0, quantity.symbol), token_contract);
                    c.balance_remaining = deposit_asset;
                    c.leftover_policy   = "refund"_n;
                });
            } else {
                check(camp_itr->sponsor == from, "Apenas o sponsor original pode adicionar fundos.");
                campaigns.modify(camp_itr, same_payer, [&](auto& c) {
                    c.total_budget      += deposit_asset;
                    c.balance_remaining += deposit_asset;
                });
            }
            return;
        }

        // Memo: "vault" → registra como depósito no Drop Vault
        if (memo == "vault") {
            drop_state ds = _get_drop_state();
            uint64_t deposit_id = ds.next_deposit_id++;
            _save_drop_state(ds);

            drop_deposits_table deposits(get_self(), get_self().value);
            deposits.emplace(get_self(), [&](auto& d) {
                d.deposit_id          = deposit_id;
                d.owner               = from;
                d.asset_type          = "token"_n;
                d.token_contract      = token_contract;
                d.token_symbol        = quantity.symbol;
                d.quantity_original   = deposit_asset;
                d.quantity_remaining  = deposit_asset;
                d.nft_asset_id        = 0;
                d.nft_template_id     = 0;
                d.status              = "available"_n;
                d.deposited_at        = time_point_sec(current_time_point().sec_since_epoch());
            });
            return;
        }

        // Depósito de jogador (wallet interna)
        balances_table balances(get_self(), from.value);
        auto bal_itr = balances.find(deposit_asset.quantity.symbol.code().raw());
        if (bal_itr == balances.end()) {
            balances.emplace(get_self(), [&](auto& b) { b.balance = deposit_asset; });
        } else {
            balances.modify(bal_itr, get_self(), [&](auto& b) { b.balance += deposit_asset; });
        }
    }

    // ==========================================
    // on_notify: atomicassets::transfer → NFT vault
    // ==========================================

    void bingo_contract::onnfttransfer(name from, name to, std::vector<uint64_t> asset_ids, std::string memo) {
        if (from == get_self() || to != get_self()) return;
        if (memo != "vault") return; // ignora transferências não-vault

        drop_state ds = _get_drop_state();

        drop_deposits_table deposits(get_self(), get_self().value);

        for (uint64_t nft_asset_id : asset_ids) {
            // Lê metadados do NFT do AtomicAssets
            atomic_assets_table aa_table("atomicassets"_n, get_self().value);
            auto nft_itr = aa_table.find(nft_asset_id);
            int32_t tpl_id   = (nft_itr != aa_table.end()) ? nft_itr->template_id   : 0;
            name    coll     = (nft_itr != aa_table.end()) ? nft_itr->collection_name : ""_n;

            uint64_t deposit_id = ds.next_deposit_id++;

            // Placeholder de extended_asset com símbolo zero (NFT não tem quantity)
            extended_asset zero_asset(asset(0, symbol("NFT", 0)), "atomicassets"_n);

            deposits.emplace(get_self(), [&](auto& d) {
                d.deposit_id          = deposit_id;
                d.owner               = from;
                d.asset_type          = "nft"_n;
                d.token_contract      = "atomicassets"_n;
                d.token_symbol        = symbol("NFT", 0);
                d.quantity_original   = zero_asset;
                d.quantity_remaining  = zero_asset;
                d.nft_asset_id        = nft_asset_id;
                d.nft_template_id     = tpl_id;
                d.nft_collection      = coll;
                d.status              = "available"_n;
                d.deposited_at        = time_point_sec(current_time_point().sec_since_epoch());
            });
        }

        _save_drop_state(ds);
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

        // Verifica max_tickets_per_player se jogo vinculado a sala
        if (game_itr->room_id != 0) {
            rooms_table rooms(get_self(), get_self().value);
            auto room_itr = rooms.find(game_itr->room_id);
            if (room_itr != rooms.end() && room_itr->max_tickets_per_player > 0) {
                tickets_table tix(get_self(), game_id);
                auto idx = tix.get_index<"byowner"_n>();
                uint32_t owned = 0;
                auto it = idx.lower_bound(buyer.value);
                while (it != idx.end() && it->owner == buyer) { ++owned; ++it; }
                check(owned + matrices.size() <= room_itr->max_tickets_per_player,
                    "Limite de cartelas por jogador excedido nesta sala.");
            }
        }

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
                        check(current_time_point().sec_since_epoch() <= conf_itr->valid_until,
                            "Utilidade do NFT expirou.");
                    }
                    if (conf_itr->discount_pct > 0) {
                        int64_t discount = (total_cost.quantity.amount * conf_itr->discount_pct) / 100;
                        total_cost.quantity.amount -= discount;
                    }
                }
            }

            balances_table balances(get_self(), buyer.value);
            auto bal_itr = balances.require_find(total_cost.quantity.symbol.code().raw(),
                "Saldo insuficiente: Token nao registrado.");
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
                t.state     = 0x00001000;
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
    // CLAIM WIN (ADR-005 Fase 2)
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
            payout = game_itr->prize_pool;
            payout.quantity.amount = (payout.quantity.amount * 85) / 100;
        } else {
            gametypes_table gametypes(get_self(), get_self().value);
            auto gt_itr = gametypes.require_find(game_itr->gametype_id, "gametype_id invalido no jogo.");
            uint16_t win_weight = 0;
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
                payout.quantity.amount * (int64_t)gt_itr->base_multiplier * (int64_t)win_weight / 100;
        }

        if (payout.quantity.amount > 0) {
            auto bal_itr = balances.find(payout.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = payout; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += payout; });
            }
        }

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

        games.modify(game_itr, same_payer, [&](auto& g) {
            g.status   = "archived"_n;
            g.end_time = time_point_sec(current_time_point().sec_since_epoch());
        });
    }

    // ==========================================
    // ABORT GAME
    // ==========================================

    void bingo_contract::abortgame(uint64_t game_id, std::string reason) {
        bool by_ms    = has_auth("microservice"_n);
        bool by_admin = has_auth(get_self());
        check(by_ms || by_admin, "Auth: microservice ou admin necessaria.");

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
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
    // REFUND TICKET
    // ==========================================

    void bingo_contract::refundticket(uint64_t game_id, uint64_t ticket_id) {
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "aborted"_n, "Estorno so disponivel para jogos ABORTED.");

        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.require_find(ticket_id, "Ticket not found.");
        name owner = ticket_itr->owner;

        if (game_itr->ticket_price.quantity.amount > 0) {
            balances_table balances(get_self(), owner.value);
            auto bal_itr = balances.find(game_itr->ticket_price.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = game_itr->ticket_price; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += game_itr->ticket_price; });
            }
        }
        tickets.erase(ticket_itr);
    }

    // ==========================================
    // CLEAR GAME
    // ==========================================

    void bingo_contract::cleargame(uint64_t game_id, uint32_t max_rows) {
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(
            game_itr->status == "archived"_n || game_itr->status == "aborted"_n,
            "cleargame: jogo deve estar em ARCHIVED ou ABORTED."
        );
        if (game_itr->status == "archived"_n) {
            uint32_t now      = current_time_point().sec_since_epoch();
            uint32_t end_ts   = game_itr->end_time.sec_since_epoch();
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
        if (tickets.begin() == tickets.end()) {
            // Limpa current_game_id da sala se necessário
            if (game_itr->room_id != 0) {
                rooms_table rooms(get_self(), get_self().value);
                auto room_itr = rooms.find(game_itr->room_id);
                if (room_itr != rooms.end() && room_itr->current_game_id == game_id) {
                    rooms.modify(room_itr, same_payer, [&](auto& r) { r.current_game_id = 0; });
                }
            }
            games.erase(game_itr);
        }
    }

    // ==========================================
    // PATROCÍNIO B2B
    // ==========================================

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
        check(camp_itr->payout_per_game.quantity.amount > 0, "payout_per_game nao configurado.");
        check(camp_itr->balance_remaining >= camp_itr->payout_per_game, "Saldo insuficiente na campanha.");

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
        campaigns.modify(camp_itr, same_payer, [&](auto& c) {
            c.balance_remaining -= c.payout_per_game;
            c.games_linked++;
        });
    }

    void bingo_contract::closecmpgn(uint64_t campaign_id) {
        campaigns_table campaigns(get_self(), get_self().value);
        auto camp_itr = campaigns.require_find(campaign_id, "campaign_id nao encontrado.");
        bool by_admin   = has_auth(get_self());
        bool by_sponsor = has_auth(camp_itr->sponsor);
        check(by_admin || by_sponsor, "Auth: admin ou sponsor necessaria.");

        if (camp_itr->balance_remaining.quantity.amount > 0 && camp_itr->leftover_policy == "refund"_n) {
            action(
                permission_level{get_self(), "active"_n},
                camp_itr->balance_remaining.contract, "transfer"_n,
                std::make_tuple(
                    get_self(), camp_itr->sponsor,
                    camp_itr->balance_remaining.quantity,
                    std::string("Saldo residual campanha " + std::to_string(campaign_id))
                )
            ).send();
        }
        campaigns.erase(camp_itr);
    }

    // ==========================================
    // ROOMS — ADR-010
    // ==========================================

    void bingo_contract::createroom(
        uint64_t       room_id,
        name           sponsor,
        uint64_t       gametype_id,
        extended_asset ticket_price_min,
        extended_asset ticket_price_max,
        extended_asset ticket_price_default,
        uint32_t       max_tickets_per_player,
        bool           sponsor_room
    ) {
        require_auth(get_self());

        rooms_table rooms(get_self(), get_self().value);
        check(rooms.find(room_id) == rooms.end(), "room_id ja existe.");

        // Valida gametype
        if (gametype_id != 0) {
            gametypes_table gametypes(get_self(), get_self().value);
            check(gametypes.find(gametype_id) != gametypes.end(), "gametype_id nao encontrado.");
        }

        // Valida preços
        check(ticket_price_min.quantity.amount > 0, "ticket_price_min deve ser maior que zero.");
        check(ticket_price_max.quantity.amount >= ticket_price_min.quantity.amount,
            "ticket_price_max deve ser >= ticket_price_min.");
        check(ticket_price_default.quantity.amount >= ticket_price_min.quantity.amount &&
              ticket_price_default.quantity.amount <= ticket_price_max.quantity.amount,
            "ticket_price_default deve estar entre min e max.");
        check(max_tickets_per_player > 0 && max_tickets_per_player <= 1000,
            "max_tickets_per_player deve estar entre 1 e 1000.");

        rooms.emplace(get_self(), [&](auto& r) {
            r.room_id                 = room_id;
            r.sponsor                 = sponsor;
            r.status                  = "inactive"_n;
            r.gametype_id             = gametype_id;
            r.ticket_price_min        = ticket_price_min;
            r.ticket_price_max        = ticket_price_max;
            r.ticket_price_default    = ticket_price_default;
            r.max_tickets_per_player  = max_tickets_per_player;
            r.current_game_id         = 0;
            r.room_drop_chance_bps    = 10000;
            r.sponsor_room            = sponsor_room;
            r.created_at              = time_point_sec(current_time_point().sec_since_epoch());
        });
    }

    void bingo_contract::activateroom(uint64_t room_id) {
        require_auth(get_self());
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(
            room_itr->status == "inactive"_n || room_itr->status == "paused"_n,
            "activateroom: sala deve estar em inactive ou paused."
        );
        rooms.modify(room_itr, same_payer, [&](auto& r) { r.status = "active"_n; });
    }

    void bingo_contract::pauseroom(uint64_t room_id) {
        require_auth(get_self());
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status == "active"_n, "pauseroom: sala deve estar ativa.");
        rooms.modify(room_itr, same_payer, [&](auto& r) { r.status = "paused"_n; });
    }

    void bingo_contract::closeroom(uint64_t room_id) {
        require_auth(get_self());
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status != "closed"_n, "closeroom: sala ja esta fechada.");
        // Não pode fechar com partida ativa
        check(room_itr->current_game_id == 0,
            "closeroom: aguarde a partida corrente terminar antes de fechar a sala.");
        rooms.modify(room_itr, same_payer, [&](auto& r) { r.status = "closed"_n; });
    }

    void bingo_contract::setroommeta(uint64_t room_id, uint16_t room_drop_chance_bps, uint32_t max_tickets_per_player) {
        require_auth(get_self());
        check(room_drop_chance_bps <= 10000, "room_drop_chance_bps deve ser 0–10000.");
        check(max_tickets_per_player > 0 && max_tickets_per_player <= 1000,
            "max_tickets_per_player deve estar entre 1 e 1000.");
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status != "closed"_n, "Sala fechada nao pode ser alterada.");
        rooms.modify(room_itr, same_payer, [&](auto& r) {
            r.room_drop_chance_bps   = room_drop_chance_bps;
            r.max_tickets_per_player = max_tickets_per_player;
        });
    }

    // ==========================================
    // DROP VAULT — ADR-011
    // ==========================================

    /**
     * allocatedrop: vincula um depósito disponível a uma sala.
     * Para tokens: quantity_per_drop define o valor por drop.
     * Para NFTs:   nft_asset_id identifica o ativo; quantity_per_drop ignorado.
     * Validação atômica on-chain previne dupla-alocação (race condition multi-aba).
     */
    void bingo_contract::allocatedrop(
        name           caller,
        uint64_t       deposit_id,
        uint64_t       room_id,
        extended_asset quantity_per_drop,
        uint64_t       nft_asset_id,
        uint16_t       drop_chance_bps
    ) {
        // Auth: owner do depósito ou admin
        drop_deposits_table deposits(get_self(), get_self().value);
        auto dep_itr = deposits.require_find(deposit_id, "deposit_id nao encontrado.");

        bool by_owner = has_auth(dep_itr->owner);
        bool by_admin = has_auth(get_self());
        check(by_owner || by_admin, "Auth: owner do deposito ou admin necessaria.");
        check(dep_itr->status == "available"_n, "Deposito nao esta disponivel.");
        check(drop_chance_bps > 0 && drop_chance_bps <= 10000, "drop_chance_bps deve ser 1–10000.");

        // Valida sala
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status != "closed"_n, "Sala fechada nao aceita novos drops.");

        if (dep_itr->asset_type == "token"_n) {
            check(quantity_per_drop.quantity.amount > 0, "quantity_per_drop deve ser maior que zero.");
            check(dep_itr->quantity_remaining >= quantity_per_drop,
                "Saldo insuficiente no deposito para o quantity_per_drop informado.");
        } else {
            // NFT: valida que não existe outra alocação ativa para o mesmo nft_asset_id
            drop_allocations_table allocs(get_self(), get_self().value);
            auto bydeposit_idx = allocs.get_index<"bydeposit"_n>();
            auto it = bydeposit_idx.lower_bound(deposit_id);
            while (it != bydeposit_idx.end() && it->deposit_id == deposit_id) {
                check(it->status != "active"_n,
                    "NFT ja esta alocada em outra sala. Desaloque primeiro.");
                ++it;
            }
        }

        // Cria alocação
        drop_state ds = _get_drop_state();
        uint64_t alloc_id = ds.next_alloc_id++;
        _save_drop_state(ds);

        drop_allocations_table allocs(get_self(), get_self().value);
        allocs.emplace(get_self(), [&](auto& a) {
            a.alloc_id             = alloc_id;
            a.deposit_id           = deposit_id;
            a.owner                = dep_itr->owner;
            a.room_id              = room_id;
            a.asset_type           = dep_itr->asset_type;
            a.token_contract       = dep_itr->token_contract;
            a.token_symbol         = dep_itr->token_symbol;
            a.quantity_per_drop    = (dep_itr->asset_type == "token"_n)
                                        ? quantity_per_drop
                                        : dep_itr->quantity_original;
            a.quantity_distributed = extended_asset(asset(0, dep_itr->token_symbol), dep_itr->token_contract);
            a.nft_asset_id         = dep_itr->nft_asset_id;
            a.nft_template_id      = dep_itr->nft_template_id;
            a.nft_collection       = dep_itr->nft_collection;
            a.drop_chance_bps      = drop_chance_bps;
            a.drops_executed       = 0;
            a.status               = "active"_n;
            a.allocated_at         = time_point_sec(current_time_point().sec_since_epoch());
        });

        // Marca depósito como alocado
        deposits.modify(dep_itr, same_payer, [&](auto& d) { d.status = "allocated"_n; });
    }

    /**
     * deallocdrop: desvincula uma alocação da sala.
     * Devolve o depósito ao status "available" se não exaurido.
     */
    void bingo_contract::deallocdrop(name caller, uint64_t alloc_id) {
        drop_allocations_table allocs(get_self(), get_self().value);
        auto alloc_itr = allocs.require_find(alloc_id, "alloc_id nao encontrado.");

        bool by_owner = has_auth(alloc_itr->owner);
        bool by_admin = has_auth(get_self());
        check(by_owner || by_admin, "Auth: owner ou admin necessaria.");
        check(alloc_itr->status == "active"_n, "Alocacao nao esta ativa.");

        // Atualiza alocação
        allocs.modify(alloc_itr, same_payer, [&](auto& a) { a.status = "deallocated"_n; });

        // Devolve depósito ao estado disponível
        drop_deposits_table deposits(get_self(), get_self().value);
        auto dep_itr = deposits.find(alloc_itr->deposit_id);
        if (dep_itr != deposits.end() && dep_itr->status == "allocated"_n) {
            // Só marca available se ainda há saldo (tokens) ou se é NFT não dropada
            bool has_balance = (dep_itr->asset_type == "token"_n)
                ? dep_itr->quantity_remaining.quantity.amount > 0
                : alloc_itr->drops_executed == 0;
            if (has_balance) {
                deposits.modify(dep_itr, same_payer, [&](auto& d) { d.status = "available"_n; });
            }
        }
    }

    /**
     * reclaimasset: sponsor saca ativo não alocado do vault.
     * Para tokens: transfere quantity_remaining via inline action.
     * Para NFTs:   transfere o NFT de volta via atomicassets::transfer.
     */
    void bingo_contract::reclaimasset(name owner, uint64_t deposit_id) {
        require_auth(owner);

        drop_deposits_table deposits(get_self(), get_self().value);
        auto dep_itr = deposits.require_find(deposit_id, "deposit_id nao encontrado.");

        check(dep_itr->owner == owner, "Apenas o owner pode resgatar este deposito.");
        check(dep_itr->status == "available"_n,
            "Deposito nao disponivel para saque. Desaloque de salas ativas primeiro.");

        if (dep_itr->asset_type == "token"_n) {
            check(dep_itr->quantity_remaining.quantity.amount > 0, "Saldo zero no deposito.");
            action(
                permission_level{get_self(), "active"_n},
                dep_itr->token_contract, "transfer"_n,
                std::make_tuple(
                    get_self(), owner,
                    dep_itr->quantity_remaining.quantity,
                    std::string("Saque vault CryptoBingo deposito #" + std::to_string(deposit_id))
                )
            ).send();
        } else {
            // NFT: devolve via atomicassets::transfer
            std::vector<uint64_t> asset_ids = { dep_itr->nft_asset_id };
            action(
                permission_level{get_self(), "active"_n},
                "atomicassets"_n, "transfer"_n,
                std::make_tuple(
                    get_self(), owner, asset_ids,
                    std::string("Saque NFT vault CryptoBingo #" + std::to_string(deposit_id))
                )
            ).send();
        }

        // Marca como depleted e remove a linha
        deposits.erase(dep_itr);
    }

    /**
     * execdrop: executa a transferência do drop ao vencedor.
     * Chamada pelo worker (microservice) após seleção do vencedor (ADR-011 Fase 2).
     * Para tokens: credita na wallet interna do vencedor.
     * Para NFTs:   transfere o NFT diretamente para a wallet do vencedor.
     */
    void bingo_contract::execdrop(uint64_t alloc_id, name winner, extended_asset quantity) {
        require_auth("microservice"_n);

        drop_allocations_table allocs(get_self(), get_self().value);
        auto alloc_itr = allocs.require_find(alloc_id, "alloc_id nao encontrado.");
        check(alloc_itr->status == "active"_n, "Alocacao nao esta ativa.");

        drop_deposits_table deposits(get_self(), get_self().value);
        auto dep_itr = deposits.require_find(alloc_itr->deposit_id, "deposit_id nao encontrado.");

        if (alloc_itr->asset_type == "token"_n) {
            // Valida saldo suficiente
            check(dep_itr->quantity_remaining >= alloc_itr->quantity_per_drop,
                "Saldo insuficiente no deposito para executar o drop.");

            // Credita na wallet interna do vencedor
            balances_table balances(get_self(), winner.value);
            auto bal_itr = balances.find(alloc_itr->quantity_per_drop.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = alloc_itr->quantity_per_drop; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) {
                    b.balance += alloc_itr->quantity_per_drop;
                });
            }

            // Debita do depósito
            deposits.modify(dep_itr, same_payer, [&](auto& d) {
                d.quantity_remaining -= alloc_itr->quantity_per_drop;
                if (d.quantity_remaining.quantity.amount <= 0) {
                    d.status = "depleted"_n;
                }
            });

            // Atualiza alocação
            bool exhausted = dep_itr->quantity_remaining.quantity.amount <= 0;
            allocs.modify(alloc_itr, same_payer, [&](auto& a) {
                a.drops_executed++;
                a.quantity_distributed += alloc_itr->quantity_per_drop;
                if (exhausted) a.status = "exhausted"_n;
            });

        } else {
            // NFT: máximo 1 drop por alocação
            check(alloc_itr->drops_executed == 0, "NFT ja foi dropada.");

            // Transfere NFT diretamente para o vencedor
            std::vector<uint64_t> asset_ids = { alloc_itr->nft_asset_id };
            action(
                permission_level{get_self(), "active"_n},
                "atomicassets"_n, "transfer"_n,
                std::make_tuple(
                    get_self(), winner, asset_ids,
                    std::string("Drop NFT CryptoBingo sala #" + std::to_string(alloc_itr->room_id))
                )
            ).send();

            // Marca alocação e depósito como esgotados
            allocs.modify(alloc_itr, same_payer, [&](auto& a) {
                a.drops_executed = 1;
                a.status         = "exhausted"_n;
            });
            deposits.modify(dep_itr, same_payer, [&](auto& d) { d.status = "depleted"_n; });
        }
    }

    // ==========================================
    // WITHDRAW
    // ==========================================

    void bingo_contract::withdraw(name owner, extended_asset amount) {
        require_auth(owner);
        balances_table balances(get_self(), owner.value);
        auto bal_itr = balances.require_find(amount.quantity.symbol.code().raw(),
            "Nenhum saldo para este token.");
        check(bal_itr->balance >= amount, "Saldo insuficiente.");
        balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance -= amount; });
        action(
            permission_level{get_self(), "active"_n},
            amount.contract, "transfer"_n,
            std::make_tuple(get_self(), owner, amount.quantity, std::string("Saque via CryptoBingo"))
        ).send();
    }

}
