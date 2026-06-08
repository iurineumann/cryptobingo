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
        config_state config = config_table.exists() ? config_table.get() : config_state{};
        config.signer_key = signer_key;
        config_table.set(config, get_self());
    }

    // ==========================================
    // SET TREASURY (ADR-005)
    // Define a conta de destino do sweep de GGR.
    // Por segurança, só o próprio contrato pode alterar.
    // ==========================================

    void bingo_contract::settreasury(name account) {
        require_auth(get_self());
        check(is_account(account), "treasury_account invalida ou inexistente.");
        config_singleton config_table(get_self(), get_self().value);
        config_state config = config_table.exists() ? config_table.get() : config_state{};
        config.treasury_account = account;
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

        // Se vinculado a uma sala, valida que ela existe, está ativa e sem partida corrente
        if (room_id != 0) {
            rooms_table rooms(get_self(), get_self().value);
            auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
            check(room_itr->status == "active"_n, "Sala nao esta ativa.");
            check(room_itr->current_game_id == 0,
                "Sala ja possui uma partida em andamento. Finalize a partida atual primeiro.");
            rooms.modify(room_itr, same_payer, [&](auto& r) {
                r.current_game_id = game_id;
            });
        }

        games.emplace(get_self(), [&](auto& g) {
            g.game_id      = game_id;
            g.status       = "created"_n;
            g.ticket_price = ticket_price;
            g.total_wagered = extended_asset(asset(0, ticket_price.quantity.symbol), ticket_price.contract);
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

    void bingo_contract::addgametype(uint64_t gametype_id, std::string name, uint8_t base_multiplier, std::vector<pattern_rule> rules, eosio::name draw_mode, uint8_t max_balls, uint8_t golden_ball_after, uint8_t master_weight_ovrd) {
        require_auth(get_self());
        check(base_multiplier > 0, "base_multiplier deve ser maior que zero.");
        check(rules.size() > 0, "rules deve ter pelo menos 1 elemento.");
        check(name.size() <= 64, "name muito longo (max 64 chars).");

        // Valida draw_mode (ADR-012)
        const std::vector<eosio::name> valid_modes = {
            "standard"_n, "fixed"_n, "firstfull"_n, "goldenball"_n, "multimatch"_n
        };
        bool valid = (draw_mode.value == 0); // 0 = não informado → default standard
        for (const auto& m : valid_modes) { if (draw_mode == m) { valid = true; break; } }
        check(valid, "draw_mode invalido. Use: standard, fixed, firstfull, goldenball, multimatch.");

        // Valida campos por modo
        if (draw_mode == "goldenball"_n) {
            check(golden_ball_after > 0 && golden_ball_after < 74,
                "golden_ball_after deve ser entre 1 e 73.");
        }

        patterns_table patterns(get_self(), get_self().value);
        for (const auto& rule : rules) {
            check(patterns.find(rule.pattern_id) != patterns.end(),
                "pattern_id " + std::to_string(rule.pattern_id) + " nao encontrado.");
            check(rule.weight > 0, "weight deve ser maior que zero.");
            check(rule.weight <= 25500, "weight max 255.00 (hundredths).");
        }

        eosio::name effective_mode = (draw_mode.value == 0) ? "standard"_n : draw_mode;

        gametypes_table gametypes(get_self(), get_self().value);
        auto itr = gametypes.find(gametype_id);
        if (itr == gametypes.end()) {
            gametypes.emplace(get_self(), [&](auto& row) {
                row.gametype_id       = gametype_id;
                row.name              = name;
                row.base_multiplier   = base_multiplier;
                row.rules             = rules;
                row.draw_mode         = effective_mode;
                row.max_balls         = max_balls;
                row.golden_ball_after = golden_ball_after;
                row.master_weight_ovrd= master_weight_ovrd;
            });
        } else {
            gametypes.modify(itr, get_self(), [&](auto& row) {
                row.name              = name;
                row.base_multiplier   = base_multiplier;
                row.rules             = rules;
                row.draw_mode         = effective_mode;
                row.max_balls         = max_balls;
                row.golden_ball_after = golden_ball_after;
                row.master_weight_ovrd= master_weight_ovrd;
            });
        }
    }

    void bingo_contract::delgametype(uint64_t gametype_id) {
        require_auth(get_self());
        gametypes_table gametypes(get_self(), get_self().value);
        gametypes.erase(gametypes.require_find(gametype_id, "gametype_id nao encontrado."));
    }

    // ==========================================
    // SET STAGES — MULTI_MATCH (ADR-013)
    // ==========================================

    void bingo_contract::setstages(uint64_t gametype_id, std::vector<stage_rule> stages) {
        require_auth(get_self());
        gametypes_table gametypes(get_self(), get_self().value);
        auto itr = gametypes.require_find(gametype_id, "gametype_id nao encontrado.");

        // Valida estágios: ordenados, sem duplicatas, weight > 0
        for (size_t i = 0; i < stages.size(); i++) {
            check(stages[i].stage > 0,        "stage deve ser maior que zero.");
            check(stages[i].patterns_required > 0, "patterns_required deve ser maior que zero.");
            check(stages[i].weight > 0,        "weight deve ser maior que zero.");
            check(stages[i].weight <= 25500,   "weight max 255.00 (hundredths).");
            if (i > 0) {
                check(stages[i].stage > stages[i-1].stage,
                    "stages devem ser ordenados crescentemente por stage.");
                check(stages[i].patterns_required >= stages[i-1].patterns_required,
                    "patterns_required deve ser nao-decrescente entre stages.");
            }
        }

        gametypes.modify(itr, get_self(), [&](auto& row) {
            row.stages = stages;
            if (!stages.empty()) row.draw_mode = "multimatch"_n;
        });
    }

    // ==========================================
    // SET COMBOS — Combinações de padrões (ADR-016)
    //
    // Registra/atualiza o vetor de combinações (combo_id → weight) de um gametype.
    // Substitui o vetor inteiro (igual a setstages). A lógica de cláusulas vive
    // off-chain; aqui só guardamos o peso para validação em claimcombo.
    // ==========================================

    void bingo_contract::setcombos(uint64_t gametype_id, std::vector<combo_rule> combinations) {
        require_auth(get_self());
        gametypes_table gametypes(get_self(), get_self().value);
        auto itr = gametypes.require_find(gametype_id, "gametype_id nao encontrado.");

        // Valida: combo_id unico, weight no intervalo valido (1.00–255.00 hundredths)
        for (size_t i = 0; i < combinations.size(); i++) {
            check(combinations[i].weight > 0,      "combo weight deve ser maior que zero.");
            check(combinations[i].weight <= 25500, "combo weight max 255.00 (hundredths).");
            for (size_t j = i + 1; j < combinations.size(); j++) {
                check(combinations[i].combo_id != combinations[j].combo_id,
                    "combo_id duplicado.");
            }
        }

        gametypes.modify(itr, get_self(), [&](auto& row) {
            row.combinations.emplace(combinations);
        });
    }

    // ==========================================
    // CLAIM COMBO — Combinação de padrões (ADR-016)
    //
    // Paga um ticket por uma COMBINAÇÃO satisfeita (tier superior ao padrão).
    // A satisfação das cláusulas é avaliada off-chain pelo worker; o contrato
    // valida que o combo_id existe no gametype e usa o weight registrado —
    // impedindo inflar o prêmio. Espelha claimwin (aceita golden_multiplier).
    // Aceita drawn|paying; transiciona drawn→paying na primeira chamada.
    // ==========================================

    void bingo_contract::claimcombo(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t combo_id, uint16_t golden_multiplier) {
        require_auth("microservice"_n);

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(
            game_itr->status == "drawn"_n || game_itr->status == "paying"_n,
            "Game deve estar em DRAWN ou PAYING para pagar combinacoes."
        );

        // Transição drawn → paying na primeira chamada
        if (game_itr->status == "drawn"_n) {
            games.modify(game_itr, same_payer, [&](auto& g) { g.status = "paying"_n; });
            game_itr = games.find(game_id);
        }

        // Busca o combo_rule no gametype e valida o peso on-chain
        gametypes_table gametypes(get_self(), get_self().value);
        auto gt_itr = gametypes.require_find(game_itr->gametype_id, "gametype_id invalido no jogo.");
        check(gt_itr->combinations.has_value() && !gt_itr->combinations.value().empty(),
            "Gametype nao tem combinacoes definidas.");

        uint16_t combo_weight = 0;
        for (const auto& c : gt_itr->combinations.value()) {
            if (c.combo_id == combo_id) { combo_weight = c.weight; break; }
        }
        check(combo_weight > 0, "combo_id nao encontrado nas combinacoes do gametype.");

        // Calcula payout: ticket.price × base_multiplier × combo_weight / 100
        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.require_find(ticket_id, "Ticket not found.");
        name winner = ticket_itr->owner;

        extended_asset payout = ticket_itr->price.quantity.amount > 0
            ? ticket_itr->price
            : game_itr->ticket_price;  // fallback para tickets legados sem price
        payout.quantity.amount =
            payout.quantity.amount * (int64_t)gt_itr->base_multiplier * (int64_t)combo_weight / 100;

        if (golden_multiplier > 1) {
            payout.quantity.amount *= (int64_t)golden_multiplier;
        }

        // Credita o vencedor
        if (payout.quantity.amount > 0) {
            balances_table balances(get_self(), winner.value);
            auto bal_itr = balances.find(payout.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = payout; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += payout; });
            }
            // ADR-005: acumula payout para cálculo do GGR em closegame
            games.modify(game_itr, same_payer, [&](auto& g) { g.total_paid += payout.quantity.amount; });
        }
        // Jogo permanece em "paying". Worker chama closegame() após o lote.
    }

    // ==========================================
    // CLAIM STAGE — MULTI_MATCH (ADR-013)
    //
    // Paga um ticket por um estágio específico.
    // Aceita drawn|paying; transiciona drawn→paying na primeira chamada.
    // Múltiplas chamadas com stages diferentes para o mesmo ticket são permitidas.
    // ==========================================

    void bingo_contract::claimstage(uint64_t game_id, uint64_t ticket_id, uint8_t stage_num, uint8_t ball_count, uint64_t win_pattern_mask) {
        require_auth("microservice"_n);

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(
            game_itr->status == "drawn"_n || game_itr->status == "paying"_n,
            "Game deve estar em DRAWN ou PAYING para pagar stages."
        );

        // Transição drawn → paying na primeira chamada
        if (game_itr->status == "drawn"_n) {
            games.modify(game_itr, same_payer, [&](auto& g) { g.status = "paying"_n; });
            game_itr = games.find(game_id);
        }

        // Busca o stage_rule no gametype
        gametypes_table gametypes(get_self(), get_self().value);
        auto gt_itr = gametypes.require_find(game_itr->gametype_id, "gametype_id invalido no jogo.");
        check(!gt_itr->stages.empty(), "Gametype nao tem stages definidos.");

        uint16_t stage_weight = 0;
        for (const auto& s : gt_itr->stages) {
            if (s.stage == stage_num) { stage_weight = s.weight; break; }
        }
        check(stage_weight > 0, "stage_num nao encontrado nos stages do gametype.");

        // Calcula payout: ticket.price × base_multiplier × stage_weight / 100
        // Usa o preço efetivo gravado no ticket para respeitar preços variáveis (ADR-010).
        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.require_find(ticket_id, "Ticket not found.");
        name winner = ticket_itr->owner;

        extended_asset payout = ticket_itr->price.quantity.amount > 0
            ? ticket_itr->price
            : game_itr->ticket_price;  // fallback para tickets legados sem price
        payout.quantity.amount =
            payout.quantity.amount * (int64_t)gt_itr->base_multiplier * (int64_t)stage_weight / 100;

        // Credita o vencedor
        if (payout.quantity.amount > 0) {
            balances_table balances(get_self(), winner.value);
            auto bal_itr = balances.find(payout.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = payout; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += payout; });
            }
            // ADR-005: acumula payout para cálculo do GGR em closegame
            games.modify(game_itr, same_payer, [&](auto& g) { g.total_paid += payout.quantity.amount; });
        }
        // Jogo permanece em "paying". Worker chama closegame() após todos os stages.
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

    void bingo_contract::buytickets(name buyer, uint64_t game_id, std::vector<std::vector<char>> matrices, std::vector<signature> signatures, uint64_t nft_id, extended_asset requested_price) {
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

        // Determina preço efetivo: se o usuário solicitou um preço customizado,
        // valida contra o range da sala e usa o solicitado; senão usa o padrão.
        extended_asset effective_price = game_itr->ticket_price;
        if (requested_price.quantity.amount > 0) {
            if (game_itr->room_id != 0) {
                rooms_table rooms(get_self(), get_self().value);
                auto room_itr = rooms.find(game_itr->room_id);
                check(room_itr != rooms.end(), "room_id nao encontrado.");
                check(requested_price.quantity.symbol == room_itr->ticket_price_min.quantity.symbol,
                    "Simbolo do preco solicitado nao corresponde ao da sala.");
                check(requested_price.contract == room_itr->ticket_price_min.contract,
                    "Contrato do preco solicitado nao corresponde ao da sala.");
                check(requested_price.quantity.amount >= room_itr->ticket_price_min.quantity.amount,
                    "Preco solicitado e menor que o minimo da sala.");
                check(requested_price.quantity.amount <= room_itr->ticket_price_max.quantity.amount,
                    "Preco solicitado e maior que o maximo da sala.");
            }
            effective_price = requested_price;
        }

        config_singleton config_table(get_self(), get_self().value);
        check(config_table.exists(), "Contract configuration not initialized.");
        auto config = config_table.get();

        tickets_table tickets(get_self(), game_id);
        extended_asset total_cost = effective_price;
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
            games.modify(game_itr, get_self(), [&](auto& g) { g.total_wagered += total_cost; });
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
                t.price     = effective_price;
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
        // signing_value = game_id — único por partida (primary key da tabela reqs).
        // Compatível com o contrato orng.wax de produção: requestrand(assoc_id, signing_value, caller).
        action(
            permission_level{get_self(), "active"_n},
            "orng.wax"_n, "requestrand"_n,
            std::make_tuple(game_id, game_id, get_self())
        ).send();
    }

    // receiverand — compatível com o callback legacy do orng.wax de produção.
    // O contrato orng.wax entrega: receiverand(assoc_id, checksum256 rnd)
    // onde rnd = sha256(rsa_sig_hex_string).
    // As 75 bolas são derivadas on-chain via Fisher-Yates seeded pelo checksum256.
    void bingo_contract::receiverand(uint64_t assoc_id, eosio::checksum256 random_value) {
        require_auth("orng.wax"_n);

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(assoc_id, "Game not found for Oracle response.");
        check(game_itr->status == "drawing"_n, "Game is not in DRAWING status.");

        // Deriva 75 bolas (1-75) via Fisher-Yates com seed do checksum256.
        // Seed: 8 bytes little-endian extraídos dos primeiros bytes do checksum256.
        auto bytes = random_value.extract_as_byte_array();

        std::vector<char> balls(75);
        for (uint8_t i = 0; i < 75; ++i) balls[i] = (char)(i + 1);

        uint64_t seed = 0;
        for (int i = 7; i >= 0; i--) seed = (seed << 8) | bytes[i];  // little-endian

        // Mistura do seed (splitmix64 — melhor distribuição inicial)
        seed ^= (seed >> 30) * 0xbf58476d1ce4e5b9ULL;
        seed ^= (seed >> 27) * 0x94d049bb133111ebULL;
        seed ^= (seed >> 31);

        // Fisher-Yates com xorshift64
        for (int i = 74; i > 0; --i) {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            int j = (int)(seed % (uint64_t)(i + 1));
            char tmp = balls[i]; balls[i] = balls[j]; balls[j] = tmp;
        }

        games.modify(game_itr, same_payer, [&](auto& g) {
            g.drawn_balls = balls;
            g.status      = "drawn"_n;
        });
    }

    // ==========================================
    // CLAIM WIN (ADR-005 Fase 2, ADR-012)
    //
    // ADR-012: aceita status "drawn" e "paying".
    //   drawn → paying na primeira chamada (multi-winner support).
    //   Worker chama closegame() após todos os claimwin do lote.
    //
    // golden_multiplier: 0 ou 1 = sem efeito; >1 = GOLDEN_BALL mode.
    // ==========================================

    void bingo_contract::claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask, uint16_t golden_multiplier) {
        require_auth("microservice"_n);

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(
            game_itr->status == "drawn"_n || game_itr->status == "paying"_n,
            "Game deve estar em DRAWN ou PAYING para pagar vencedores."
        );

        // Transição drawn → paying na primeira chamada
        if (game_itr->status == "drawn"_n) {
            games.modify(game_itr, same_payer, [&](auto& g) {
                g.status = "paying"_n;
            });
            game_itr = games.find(game_id);
        }

        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.require_find(ticket_id, "Ticket not found.");

        name winner = ticket_itr->owner;
        balances_table balances(get_self(), winner.value);
        extended_asset payout;

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
        payout = ticket_itr->price.quantity.amount > 0
            ? ticket_itr->price
            : game_itr->ticket_price;
        payout.quantity.amount =
            payout.quantity.amount * (int64_t)gt_itr->base_multiplier * (int64_t)win_weight / 100;

        if (golden_multiplier > 1) {
            payout.quantity.amount *= (int64_t)golden_multiplier;
        }

        if (payout.quantity.amount > 0) {
            auto bal_itr = balances.find(payout.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = payout; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += payout; });
            }
            // ADR-005: acumula payout do total_wagered para cálculo do GGR em closegame
            games.modify(game_itr, same_payer, [&](auto& g) { g.total_paid += payout.quantity.amount; });
            game_itr = games.find(game_id);
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
        // Jogo permanece em "paying". Worker chama closegame() após o lote.
    }

    // ==========================================
    // CLOSE GAME (ADR-012)
    // Chamado pelo worker após todos os claimwin do lote.
    // Aceita paying|drawn (drawn: jogo sem vencedores encerrado diretamente).
    // ==========================================

    void bingo_contract::closegame(uint64_t game_id) {
        require_auth("microservice"_n);
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");

        bool needs_archive = game_itr->status == "paying"_n || game_itr->status == "drawn"_n;
        // Aceita também games já arquivados para corrigir current_game_id da sala (recovery)
        bool already_done  = game_itr->status == "archived"_n;
        check(needs_archive || already_done,
            "Game deve estar em PAYING, DRAWN ou ARCHIVED para closegame.");

        // Libera o slot da sala para que uma nova partida possa ser criada
        if (game_itr->room_id != 0) {
            rooms_table rooms(get_self(), get_self().value);
            auto room_itr = rooms.find(game_itr->room_id);
            if (room_itr != rooms.end() && room_itr->current_game_id == game_id) {
                rooms.modify(room_itr, same_payer, [&](auto& r) { r.current_game_id = 0; });
            }
        }

        if (needs_archive) {
            // ADR-005: calcula GGR = total_wagered - total_paid e acumula no pool
            int64_t ggr_amount = game_itr->total_wagered.quantity.amount - game_itr->total_paid;
            if (ggr_amount > 0) {
                ggr_pool_table ggr_pool(get_self(), get_self().value);
                auto ggr_key = game_itr->total_wagered.quantity.symbol.code().raw();
                auto ggr_itr = ggr_pool.find(ggr_key);
                if (ggr_itr == ggr_pool.end()) {
                    extended_asset ggr_entry = game_itr->total_wagered;
                    ggr_entry.quantity.amount = ggr_amount;
                    ggr_pool.emplace(get_self(), [&](auto& r) { r.ggr = ggr_entry; });
                } else {
                    ggr_pool.modify(ggr_itr, same_payer, [&](auto& r) {
                        r.ggr.quantity.amount += ggr_amount;
                    });
                }
            }

            games.modify(game_itr, same_payer, [&](auto& g) {
                g.status   = "archived"_n;
                g.end_time = time_point_sec(current_time_point().sec_since_epoch());
            });
        }
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
            game_itr->status == "locked"_n   ||
            game_itr->status == "drawing"_n  ||
            game_itr->status == "paying"_n,
            "Game deve estar em LOCKED, DRAWING ou PAYING para ser abortado."
        );
        // Libera o slot da sala para que uma nova partida possa ser criada
        if (game_itr->room_id != 0) {
            rooms_table rooms(get_self(), get_self().value);
            auto room_itr = rooms.find(game_itr->room_id);
            if (room_itr != rooms.end() && room_itr->current_game_id == game_id) {
                rooms.modify(room_itr, same_payer, [&](auto& r) { r.current_game_id = 0; });
            }
        }

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

        // Reembolsa pelo preço efetivo do ticket; fallback para o preço do jogo em tickets legados.
        const extended_asset& refund_price = ticket_itr->price.quantity.amount > 0
            ? ticket_itr->price
            : game_itr->ticket_price;
        if (refund_price.quantity.amount > 0) {
            balances_table balances(get_self(), owner.value);
            auto bal_itr = balances.find(refund_price.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = refund_price; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += refund_price; });
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
        check(max_tickets_per_player <= 1000,
            "max_tickets_per_player maximo é 1000 (0 = sem limite).");

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
        check(max_tickets_per_player <= 1000,
            "max_tickets_per_player maximo é 1000 (0 = sem limite).");
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

    // ==========================================
    // SWEEP GGR (ADR-005)
    // Transfere o GGR acumulado para o treasury_account configurado.
    // Auth: apenas bingo.game (admin).
    // Idempotente: se pool vazio, não faz nada.
    // ==========================================

    void bingo_contract::sweepggr(name token_contract, symbol_code sym) {
        require_auth(get_self());

        ggr_pool_table ggr_pool(get_self(), get_self().value);
        auto ggr_itr = ggr_pool.find(sym.raw());
        check(ggr_itr != ggr_pool.end(), "Nenhum GGR acumulado para este token.");
        check(ggr_itr->ggr.quantity.amount > 0, "GGR acumulado e zero.");
        check(ggr_itr->ggr.contract == token_contract, "token_contract nao corresponde ao registrado no pool.");

        config_singleton config_table(get_self(), get_self().value);
        check(config_table.exists(), "Config nao inicializada. Execute setconfig primeiro.");
        name treasury = config_table.get().treasury_account;
        check(is_account(treasury), "treasury_account invalida.");
        check(treasury != get_self(), "treasury nao pode ser o proprio contrato.");

        extended_asset ggr_to_sweep = ggr_itr->ggr;

        // Zera o pool antes do transfer (re-entrância prevention)
        ggr_pool.erase(ggr_itr);

        action(
            permission_level{get_self(), "active"_n},
            ggr_to_sweep.contract, "transfer"_n,
            std::make_tuple(
                get_self(),
                treasury,
                ggr_to_sweep.quantity,
                std::string("CryptoBingo GGR sweep")
            )
        ).send();
    }

}
