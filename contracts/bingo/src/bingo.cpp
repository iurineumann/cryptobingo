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

    // Bit de idempotência: marca ticket já pago (claimwin/claimwinbatch).
    // Reusa o campo state (uint32_t, já existente) — custo ZERO de RAM.
    // Claims multi-estágio (claimstage/claimcombo, MULTI_MATCH) NÃO usam este bit
    // (exigem paid_mask por stage — OPÇÃO B, fora do escopo da Fase 2).
    static constexpr uint32_t TICKET_STATE_PAID = 0x80000000;

    void bingo_contract::_save_drop_state(drop_state& ds) {
        drop_state_singleton ds_table(get_self(), get_self().value);
        ds_table.set(ds, get_self());
    }

    // ==========================================
    // ADR-028 §2 — Deserialização de schema field (ALPHA AtomicAssets) on-chain
    // ==========================================

    // Lê um varint sem sinal (LEB128) — encoding usado pelo atomicdata.
    static uint64_t _aa_read_varuint(const std::vector<uint8_t>& d, size_t& i) {
        uint64_t result = 0; int shift = 0;
        while (i < d.size()) {
            uint8_t b = d[i++];
            result |= (uint64_t)(b & 0x7f) << shift;
            if (!(b & 0x80)) break;
            shift += 7;
            if (shift >= 64) break;
        }
        return result;
    }

    // Avança o cursor `i` por UM valor do `type`, capturando o valor numérico quando
    // aplicável. Retorna false se o tipo for desconhecido ou os dados truncarem.
    static bool _aa_decode_value(const std::string& type, const std::vector<uint8_t>& d,
                                 size_t& i, bool& is_num, uint64_t& num) {
        is_num = false; num = 0;

        // arrays "X[]" → varint(count) + count × elemento
        if (type.size() >= 2 && type.compare(type.size() - 2, 2, "[]") == 0) {
            std::string el = type.substr(0, type.size() - 2);
            uint64_t count = _aa_read_varuint(d, i);
            for (uint64_t k = 0; k < count; k++) {
                bool b; uint64_t n;
                if (!_aa_decode_value(el, d, i, b, n)) return false;
            }
            return true;
        }
        // length-prefixed (varint len + bytes)
        if (type == "string" || type == "image" || type == "ipfs") {
            uint64_t len = _aa_read_varuint(d, i);
            i += (size_t)len;
            return i <= d.size();
        }
        // 1 byte cru
        if (type == "bool" || type == "byte") {
            if (i >= d.size()) return false;
            num = d[i++]; is_num = true; return true;
        }
        // inteiros sem sinal → varint
        if (type == "uint8" || type == "uint16" || type == "uint32" || type == "uint64") {
            num = _aa_read_varuint(d, i); is_num = true; return true;
        }
        // inteiros com sinal → varint zigzag
        if (type == "int8" || type == "int16" || type == "int32" || type == "int64") {
            uint64_t v = _aa_read_varuint(d, i);
            int64_t sv = (int64_t)(v >> 1) ^ -(int64_t)(v & 1);
            num = (uint64_t)sv; is_num = true; return true;
        }
        // fixedN (N = bits) → N/8 bytes little-endian
        if (type.rfind("fixed", 0) == 0) {
            int bits = atoi(type.c_str() + 5);
            int bytes = bits / 8;
            if (bytes <= 0 || bytes > 8 || i + (size_t)bytes > d.size()) return false;
            uint64_t v = 0;
            for (int k = 0; k < bytes; k++) v |= (uint64_t)d[i + k] << (8 * k);
            i += (size_t)bytes; num = v; is_num = true; return true;
        }
        if (type == "float")  { i += 4; return i <= d.size(); }
        if (type == "double") { i += 8; return i <= d.size(); }
        return false; // tipo desconhecido → não dá para avançar com segurança
    }

    // Percorre `data` segundo `format` procurando `field` numérico. ALPHA: sequência
    // de [identifier varint][valor]. No AtomicAssets os identificadores de atributo
    // começam em 4 (valores 0-3 reservados): índice 0-based no format = identifier - 4.
    // (Confirmado empiricamente nos schemas utility/prize do dev env.)
    static constexpr uint64_t AA_ID_BASE = 4;
    static bool _aa_walk(const std::vector<uint8_t>& data, const std::vector<aa_format>& format,
                         const std::string& field, uint64_t& out) {
        size_t i = 0;
        while (i < data.size()) {
            uint64_t identifier = _aa_read_varuint(data, i);
            if (identifier < AA_ID_BASE) return false;
            uint64_t idx = identifier - AA_ID_BASE;
            if (idx >= format.size()) return false;
            const aa_format& line = format[idx];
            bool is_num; uint64_t num;
            if (!_aa_decode_value(line.type, data, i, is_num, num)) return false;
            if (line.name == field) {
                if (!is_num) return false; // campo alvo não-numérico
                out = num; return true;
            }
        }
        return false; // campo não presente nestes dados
    }

    bool bingo_contract::_read_schema_numeric(name collection, name schema, int32_t template_id,
                                              const std::vector<uint8_t>& asset_imm,
                                              const std::string& field, uint64_t& out) {
        atomic_schemas_table schemas("atomicassets"_n, collection.value);
        auto sch_itr = schemas.find(schema.value);
        if (sch_itr == schemas.end()) return false;
        const auto& format = sch_itr->format;

        // 1) tenta o immutable do próprio asset (dados únicos por asset)
        if (!asset_imm.empty() && _aa_walk(asset_imm, format, field, out)) return true;

        // 2) fallback: immutable compartilhado do template
        atomic_templates_table templates("atomicassets"_n, collection.value);
        auto tpl_itr = templates.find((uint64_t)(int64_t)template_id);
        if (tpl_itr != templates.end() &&
            _aa_walk(tpl_itr->immutable_serialized_data, format, field, out)) return true;

        return false;
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
        // Preserva signer_key e oracle_account (ou defaults se ausentes)
        config_table.set(config, get_self());
    }

    // ADR-XXX: parametriza conta do oráculo RNG.
    // Só admin (bingogamectr@admin) pode alterar. Valida existência da conta.
    void bingo_contract::setoracle(name oracle) {
        require_auth(permission_level{get_self(), "admin"_n});
        check(is_account(oracle), "oracle_account invalida ou inexistente.");
        config_singleton config_table(get_self(), get_self().value);
        config_state config = config_table.exists() ? config_table.get() : config_state{};
        config.oracle_account.emplace(oracle);
        config_table.set(config, get_self());
    }

    // ==========================================
    // FSM — CRIAÇÃO E ABERTURA DE VENDAS
    // ==========================================

    void bingo_contract::creategame(uint64_t game_id, extended_asset ticket_price, uint64_t gametype_id, uint64_t room_id) {
        require_auth(permission_level{get_self(), "admin"_n});
        games_table games(get_self(), get_self().value);
        check(games.find(game_id) == games.end(), "Game ID already exists.");

        if (gametype_id != 0) {
            gametypes_table gametypes(get_self(), get_self().value);
            auto gt_itr = gametypes.find(gametype_id);
            check(gt_itr != gametypes.end(), "gametype_id nao encontrado.");
            // ADR-051: gametype multimatch sem stages produz jogo invalido
            // (revela 75 bolas e nao paga). Bloqueia na criacao do jogo.
            if (gt_itr->draw_mode == "multimatch"_n) {
                check(!gt_itr->stages.empty(),
                    "Gametype multimatch sem stages definidos. Use setstages antes de criar o jogo.");
            }
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
        require_auth("bingogamesvc"_n);
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "created"_n, "Game is not in CREATED status.");
        games.modify(game_itr, same_payer, [&](auto& g) {
            g.status    = "funding"_n;
            g.funded_at = current_time_point().sec_since_epoch();  // ADR-056
        });
    }

    // ==========================================
    // GESTÃO DE NFTs
    // ==========================================

    // ADR-028 §1: configura motor multi-regra por template.
    // Substitui setnftconf. Valida cada regra (tipo, origem do valor, limites).
    void bingo_contract::confignft(uint64_t template_id, name collection_name, std::vector<nft_rule> rules) {
        require_auth(permission_level{get_self(), "admin"_n});
        check(collection_name.value != 0, "collection_name obrigatorio.");
        check(rules.size() > 0,  "rules deve ter pelo menos 1 elemento.");
        check(rules.size() <= 16, "rules: maximo 16 por template.");

        for (const auto& r : rules) {
            check(r.type >= RULE_TICKET_DISCOUNT && r.type <= RULE_BURN_TO_CLAIM,
                "rule.type invalido (1=discount,2=boost,3=access,4=burn).");
            check(r.value_origin == VALUE_FIXED || r.value_origin == VALUE_SCHEMA_FIELD,
                "rule.value_origin invalido (0=fixed,1=schema_field).");
            check(r.condition == COND_OWNS || r.condition == COND_BURNED,
                "rule.condition invalido (0=owns,1=burned).");

            // BURN_TO_CLAIM exige condition=burned + duração do grant. Demais tipos
            // (discount/boost/access) aceitam owns OU burned: condition=burned = o
            // benefício é concedido via grant após a queima (ADR-028 §8).
            if (r.type == RULE_BURN_TO_CLAIM) {
                check(r.condition == COND_BURNED, "BURN_TO_CLAIM exige condition=burned.");
                check(r.grant_duration_sec > 0, "BURN_TO_CLAIM exige grant_duration_sec > 0.");
            }
            // benefícios burned devem ser FIXED (asset queimado não tem schema p/ ler)
            if (r.condition == COND_BURNED && r.type != RULE_BURN_TO_CLAIM) {
                check(r.value_origin == VALUE_FIXED,
                    "regra burned (nao-burn) exige value_origin=fixed.");
            }

            if (r.value_origin == VALUE_FIXED) {
                // hundredths: discount cap 100% (10000); boost cap 255x (25500)
                if (r.type == RULE_TICKET_DISCOUNT) {
                    check(r.fixed_value > 0 && r.fixed_value <= 10000,
                        "TICKET_DISCOUNT fixed_value: 1..10000 (hundredths de %).");
                } else if (r.type == RULE_PRIZE_BOOST) {
                    check(r.fixed_value > 0 && r.fixed_value <= 25500,
                        "PRIZE_BOOST fixed_value: 1..25500 (hundredths).");
                }
            } else { // VALUE_SCHEMA_FIELD
                check(!r.schema_field.empty(), "VALUE_SCHEMA_FIELD exige schema_field.");
                check(r.schema_field.size() <= 64, "schema_field muito longo (max 64).");
            }
        }

        nftconfigs_table _configs(get_self(), get_self().value);
        auto itr = _configs.find(template_id);
        if (itr == _configs.end()) {
            _configs.emplace(get_self(), [&](auto& row) {
                row.template_id     = template_id;
                row.collection_name = collection_name;
                row.rules           = rules;
            });
        } else {
            _configs.modify(itr, get_self(), [&](auto& row) {
                row.collection_name = collection_name;
                row.rules           = rules;
            });
        }
    }

    void bingo_contract::delnftconf(uint64_t template_id) {
        require_auth(permission_level{get_self(), "admin"_n});
        nftconfigs_table _configs(get_self(), get_self().value);
        _configs.erase(_configs.require_find(template_id, "Template ID nao encontrado."));
    }

    // ADR-028 §8: registra um burn provado off-chain (AtomicAssets API) pelo worker.
    // Trust model: worker é trusted (igual claimwin). Idempotente por asset_id.
    // Para cada regra BURN_TO_CLAIM do template, cria um grant temporário.
    void bingo_contract::recordburn(name owner, uint64_t asset_id, uint64_t template_id, name collection) {
        require_auth("bingogamesvc"_n);

        nft_burns_table burns(get_self(), get_self().value);
        auto by_asset = burns.get_index<"byasset"_n>();
        check(by_asset.find(asset_id) == by_asset.end(), "Burn ja registrado para este asset_id.");

        nft_seq_singleton seq_t(get_self(), get_self().value);
        nft_seq seq = seq_t.get_or_default(nft_seq{});

        // RAM pago pelo contrato: em recordburn quem assina é o worker
        // (bingogamesvc), não o player — não dá para cobrar RAM do owner sem a
        // autorização dele. (Diverge do ADR §Consequências, que assumia buyer.)
        uint64_t burn_id = seq.next_burn_id++;
        burns.emplace(get_self(), [&](auto& b) {
            b.burn_id     = burn_id;
            b.owner       = owner;
            b.asset_id    = asset_id;
            b.template_id = template_id;
            b.collection  = collection;
            b.burned_at   = current_time_point();
        });

        nftconfigs_table _configs(get_self(), get_self().value);
        auto conf_itr = _configs.find(template_id);
        if (conf_itr != _configs.end()) {
            nft_grants_table grants(get_self(), get_self().value);
            for (const auto& r : conf_itr->rules) {
                if (r.type != RULE_BURN_TO_CLAIM) continue;
                uint64_t grant_id = seq.next_grant_id++;
                time_point until = current_time_point() + eosio::seconds(r.grant_duration_sec);
                grants.emplace(get_self(), [&](auto& g) {
                    g.grant_id    = grant_id;
                    g.owner       = owner;
                    g.template_id = template_id;
                    g.rule_type   = r.type;
                    g.grant_until = until;
                });
            }
        }

        seq_t.set(seq, get_self());
    }

    // ==========================================
    // ADR-004 FASE 2 — PADRÕES DINÂMICOS
    // ==========================================

    void bingo_contract::addpattern(uint64_t pattern_id, std::string name, uint32_t mask) {
        require_auth(permission_level{get_self(), "admin"_n});
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
        require_auth(permission_level{get_self(), "admin"_n});
        patterns_table patterns(get_self(), get_self().value);
        patterns.erase(patterns.require_find(pattern_id, "pattern_id nao encontrado."));
    }

    void bingo_contract::addgametype(uint64_t gametype_id, std::string name, uint8_t base_multiplier, std::vector<pattern_rule> rules, eosio::name draw_mode, uint8_t max_balls, uint8_t golden_ball_after, uint16_t master_weight_ovrd) {
        require_auth(permission_level{get_self(), "admin"_n});
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

        // Valida campos por modo (ADR-051: consistência semântica por draw_mode)
        if (draw_mode == "goldenball"_n) {
            check(golden_ball_after > 0 && golden_ball_after < 74,
                "golden_ball_after deve ser entre 1 e 73.");
        }
        if (draw_mode == "fixed"_n) {
            check(max_balls >= 1 && max_balls <= 75,
                "fixed exige max_balls entre 1 e 75.");
        }

        patterns_table patterns(get_self(), get_self().value);
        bool has_master = false;
        for (const auto& rule : rules) {
            auto pat_itr = patterns.find(rule.pattern_id);
            check(pat_itr != patterns.end(),
                "pattern_id " + std::to_string(rule.pattern_id) + " nao encontrado.");
            check(rule.weight > 0, "weight deve ser maior que zero.");
            check(rule.weight <= 25500, "weight max 255.00 (hundredths).");
            if (pat_itr->mask == 0x1FFFFFF) has_master = true;
        }

        // ADR-051: firstfull só premia o MASTER — exige regra do padrão MASTER.
        if (draw_mode == "firstfull"_n) {
            check(has_master,
                "firstfull exige uma regra com o padrao MASTER (mask 0x1FFFFFF).");
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
        require_auth(permission_level{get_self(), "admin"_n});
        gametypes_table gametypes(get_self(), get_self().value);
        gametypes.erase(gametypes.require_find(gametype_id, "gametype_id nao encontrado."));
    }

    // ==========================================
    // SET STAGES — MULTI_MATCH (ADR-013)
    // ==========================================

    void bingo_contract::setstages(uint64_t gametype_id, std::vector<stage_rule> stages) {
        require_auth(permission_level{get_self(), "admin"_n});
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
        require_auth(permission_level{get_self(), "admin"_n});
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
            row.combinations.emplace(combinations);  // binary_extension::emplace substitui o valor
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
        require_auth("bingogamesvc"_n);

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
        require_auth("bingogamesvc"_n);

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

        // ADR-052: idempotência por (ticket, stage) — evita double-pay em retry
        uint64_t stage_bit = 1ULL << stage_num;
        check(!(ticket_itr->paid_stages & stage_bit), "stage ja pago (idempotencia)");

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

        // ADR-052: marca bit de stage pago (idempotência)
        {
            auto t_itr = tickets.find(ticket_id);
            if (t_itr != tickets.end())
                tickets.modify(t_itr, same_payer, [&](auto& t) { t.paid_stages |= stage_bit; });
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

        // Memo: "room:{id}" → custeio do treasury de sala patrocinada (ADR-028 §5)
        const std::string ROOM_PREFIX = "room:";
        if (memo.rfind(ROOM_PREFIX, 0) == 0) {
            uint64_t room_id = std::stoull(memo.substr(ROOM_PREFIX.size()));
            rooms_table rooms(get_self(), get_self().value);
            auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
            check(room_itr->sponsor_room, "Sala nao e patrocinada (sponsor_room=false).");
            check(room_itr->sponsor == from, "Apenas o sponsor da sala pode custear o treasury.");

            room_treasuries_table treasuries(get_self(), get_self().value);
            auto t_itr = treasuries.find(room_id);
            if (t_itr == treasuries.end()) {
                treasuries.emplace(get_self(), [&](auto& t) {
                    t.room_id = room_id;
                    t.balance = deposit_asset;
                    t.locked  = extended_asset(asset(0, quantity.symbol), token_contract);
                });
            } else {
                check(t_itr->balance.quantity.symbol == quantity.symbol &&
                      t_itr->balance.contract == token_contract,
                    "Token do deposito difere do treasury da sala.");
                treasuries.modify(t_itr, get_self(), [&](auto& t) { t.balance += deposit_asset; });
            }
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
            // ADR-028 §6/§8: melhor TICKET_DISCOUNT elegível, em hundredths-de-%
            // (10000 = 100%). Considera regras owns (NFT possuído via nft_id) e
            // burned (grant BURN_TO_CLAIM ativo). Aplica UM desconto (o maior).
            uint32_t best_hbp = 0;

            if (nft_id != 0) {
                atomic_assets_table buyer_nfts("atomicassets"_n, buyer.value);
                auto nft_itr = buyer_nfts.require_find(nft_id, "NFT nao pertence a sua carteira.");

                // ADR-028 §4: NFT usado em sala com allowlist → template autorizado.
                if (game_itr->room_id != 0) {
                    rooms_table rooms(get_self(), get_self().value);
                    auto room_itr = rooms.find(game_itr->room_id);
                    if (room_itr != rooms.end() && room_itr->nft_template_allowlist.has_value()) {
                        const auto& allow = room_itr->nft_template_allowlist.value();
                        if (!allow.empty()) {
                            bool ok = false;
                            for (auto t : allow) {
                                if (t == (uint64_t)nft_itr->template_id) { ok = true; break; }
                            }
                            check(ok, "NFT nao esta na allowlist de templates desta sala.");
                        }
                    }
                }

                nftconfigs_table _configs(get_self(), get_self().value);
                auto conf_itr = _configs.find((uint64_t)nft_itr->template_id);
                if (conf_itr != _configs.end()) {
                    check(conf_itr->collection_name == nft_itr->collection_name,
                        "NFT nao pertence a colecao configurada para o template.");
                    // owns: VALUE_FIXED (hundredths-de-%) ou VALUE_SCHEMA_FIELD
                    // (campo do schema é PERCENT inteiro, ex. discount_pct=10 → ×100).
                    for (const auto& r : conf_itr->rules) {
                        if (r.type != RULE_TICKET_DISCOUNT) continue;
                        if (r.condition != COND_OWNS) continue;
                        if (r.value_origin == VALUE_FIXED) {
                            if (r.fixed_value > best_hbp) best_hbp = r.fixed_value;
                        } else { // VALUE_SCHEMA_FIELD
                            uint64_t v = 0;
                            if (_read_schema_numeric(nft_itr->collection_name, nft_itr->schema_name,
                                    nft_itr->template_id, nft_itr->immutable_serialized_data,
                                    r.schema_field, v)) {
                                uint32_t hbp = (v > 100 ? 100 : (uint32_t)v) * 100;
                                if (hbp > best_hbp) best_hbp = hbp;
                            }
                        }
                    }
                }
            }

            // ADR-028 §8: desconto via grant BURN_TO_CLAIM ativo (jogador queimou o
            // NFT → não o possui; benefício só FIXED, pois não há asset p/ ler schema).
            {
                nft_grants_table grants(get_self(), get_self().value);
                auto gidx = grants.get_index<"byowner"_n>();
                uint32_t now_sec = current_time_point().sec_since_epoch();
                nftconfigs_table _gconfigs(get_self(), get_self().value);
                for (auto it = gidx.lower_bound(buyer.value);
                     it != gidx.end() && it->owner == buyer; ++it) {
                    if (it->grant_until.sec_since_epoch() <= now_sec) continue; // expirado
                    auto conf_itr = _gconfigs.find(it->template_id);
                    if (conf_itr == _gconfigs.end()) continue;
                    for (const auto& r : conf_itr->rules) {
                        if (r.type != RULE_TICKET_DISCOUNT) continue;
                        if (r.condition != COND_BURNED) continue;
                        if (r.value_origin != VALUE_FIXED) continue;
                        if (r.fixed_value > best_hbp) best_hbp = r.fixed_value;
                    }
                }
            }

            if (best_hbp > 10000) best_hbp = 10000; // cap 100%
            if (best_hbp > 0) {
                int64_t discount = (total_cost.quantity.amount * (int64_t)best_hbp) / 10000;
                total_cost.quantity.amount -= discount;
            }

            balances_table balances(get_self(), buyer.value);
            auto bal_itr = balances.require_find(total_cost.quantity.symbol.code().raw(),
                "Saldo insuficiente: Token nao registrado.");
            check(bal_itr->balance >= total_cost, "Saldo insuficiente.");
            balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance -= total_cost; });
            games.modify(game_itr, get_self(), [&](auto& g) { g.total_wagered += total_cost; });

            // ADR-028 §6: em sala patrocinada, ticket sales creditam o room_treasury
            // (o desconto TICKET_DISCOUNT é absorvido pelo sponsor: já está no total_cost).
            if (game_itr->room_id != 0) {
                rooms_table rooms(get_self(), get_self().value);
                auto room_itr = rooms.find(game_itr->room_id);
                if (room_itr != rooms.end() && room_itr->sponsor_room) {
                    room_treasuries_table treasuries(get_self(), get_self().value);
                    auto t_itr = treasuries.require_find(game_itr->room_id,
                        "Treasury da sala patrocinada nao inicializado.");
                    check(t_itr->balance.quantity.symbol == total_cost.quantity.symbol &&
                          t_itr->balance.contract == total_cost.contract,
                        "Token do ticket difere do treasury da sala.");
                    treasuries.modify(t_itr, same_payer, [&](auto& t) { t.balance += total_cost; });
                }
            }
        }

        for (size_t i = 0; i < matrices.size(); ++i) {
            // ADR-028 §6: nft_id entra no hash assinado (matrix + game_id + buyer + nft_id),
            // acoplando a NFT de benefício à assinatura — impede trocar a NFT pós-assinatura.
            size_t buffer_size = eosio::pack_size(matrices[i]) + sizeof(uint64_t) + sizeof(name) + sizeof(uint64_t);
            std::vector<char> buffer(buffer_size);
            datastream<char*> ds(buffer.data(), buffer.size());
            ds << matrices[i] << game_id << buyer << nft_id;
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
        require_auth("bingogamesvc"_n);
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "funding"_n, "Game is not in FUNDING status.");
        games.modify(game_itr, same_payer, [&](auto& g) { g.status = "locked"_n; });
    }

    void bingo_contract::startdraw(uint64_t game_id) {
        require_auth("bingogamesvc"_n);
        config_singleton config_table(get_self(), get_self().value);
        check(config_table.exists(), "Contract configuration not initialized.");
        auto config = config_table.get();
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "locked"_n, "Game is not in LOCKED status.");
        check(game_itr->total_wagered.quantity.amount > 0, "Cannot start draw without tickets.");
        games.modify(game_itr, same_payer, [&](auto& g) { g.status = "drawing"_n; });
        // signing_value = game_id — único por partida (primary key da tabela reqs).
        // Compatível com o contrato orng.wax de produção: requestrand(assoc_id, signing_value, caller).
        // Inline requestrand disparado como 'active' (NÃO 'admin'): o contrato orng faz
        // require_auth(caller) onde caller = bingogamectr, que o EOSIO resolve para a
        // permissão MÍNIMA bingogamectr@active. Uma permissão filha ('admin') não satisfaz
        // a pai ('active') — daí o inline PRECISA ser 'active'. Para autorizar o inline,
        // bingogamectr@active DEVE conter eosio.code (delegação inline padrão EOSIO; a chave
        // fria permanece fria — eosio.code é permissão virtual, não expõe a chave privada).
        action(
            permission_level{get_self(), "active"_n},
            config.oracle_account.value_or("orng.wax"_n), "requestrand"_n,
            std::make_tuple(game_id, game_id, get_self())
        ).send();
    }

    // C4: corpo compartilhado — Fisher-Yates + drawn + grava random_value (auditoria).
    // Chamado por receiverand (legacy) e randnotify (ORNG v3.2). Auth fica no caller.
    void bingo_contract::_apply_random(uint64_t game_id, const eosio::checksum256& random_value) {
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found for Oracle response.");
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
            g.drawn_balls  = balls;
            g.status       = "drawn"_n;
            g.random_value = random_value;  // C4: auditoria on-chain do seed ORNG
        });
    }

    // receiverand — compatível com o callback legacy do orng.wax de produção.
    // O contrato orng.wax entrega: receiverand(assoc_id, checksum256 rnd)
    // onde rnd = sha256(rsa_sig_hex_string).
    void bingo_contract::receiverand(uint64_t assoc_id, eosio::checksum256 random_value) {
        config_singleton config_table(get_self(), get_self().value);
        check(config_table.exists(), "Contract configuration not initialized.");
        require_auth(config_table.get().oracle_account.value_or("orng.wax"_n));
        _apply_random(assoc_id, random_value);
    }

    // randnotify — ORNG v3.2 notify moderno.
    // Assinatura oficial: randnotify(request_id, dapp, assoc_id, rnd).
    void bingo_contract::randnotify(uint64_t /*request_id*/, eosio::name dapp, uint64_t assoc_id,
                                    const eosio::checksum256& rnd) {
        config_singleton config_table(get_self(), get_self().value);
        check(config_table.exists(), "Contract configuration not initialized.");
        require_auth(config_table.get().oracle_account.value_or("orng.wax"_n));
        check(dapp == get_self(), "randnotify dapp mismatch");
        _apply_random(assoc_id, rnd);
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

    void bingo_contract::claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask, uint16_t golden_multiplier, eosio::binary_extension<std::vector<uint64_t>> boost_nft_ids) {
        require_auth("bingogamesvc"_n);

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(
            game_itr->status == "drawn"_n || game_itr->status == "paying"_n,
            "Game deve estar em DRAWN ou PAYING para pagar vencedores."
        );

        // ADR-030: permite pagar jogo arquivado SEM pagamento (total_paid==0),
        // para recover vencedores de jogos que viraram 'archived' sem pagar
        // (ex: worker arquivou no catch antes de liquidar os vencedores por padrão).
        bool archived_unpaid = game_itr->status == "archived"_n && game_itr->total_paid == 0;
        check(
            game_itr->status == "drawn"_n
         || game_itr->status == "paying"_n
         || archived_unpaid,
            "Game deve estar em DRAWN, PAYING ou ARCHIVED(não pago) para pagar vencedores."
        );

        // Transição archived→paying ao retomar pagamento de jogo arquivado não pago
        if (archived_unpaid) {
            games.modify(game_itr, same_payer, [&](auto& g) {
                g.status = "paying"_n;
            });
            game_itr = games.find(game_id);
        }

        // Transição drawn → paying na primeira chamada
        if (game_itr->status == "drawn"_n) {
            games.modify(game_itr, same_payer, [&](auto& g) {
                g.status = "paying"_n;
            });
            game_itr = games.find(game_id);
        }

        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.require_find(ticket_id, "Ticket not found.");

        // IDEMPOTÊNCIA (ADR-036): rejeita ticket já pago — evita double-pay on-chain.
        check(!(ticket_itr->state & TICKET_STATE_PAID), "ticket ja pago (idempotencia).");

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
                // ADR-012 §4: FIRST_FULL — master_weight_ovrd substitui peso do MASTER
                if (gt_itr->master_weight_ovrd > 0 && (uint64_t)pat_itr->mask == 0x1FFFFFF) {
                    win_weight = gt_itr->master_weight_ovrd;
                }
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

        // ADR-028 §7/§8: Prize Boost. Aplica o maior boost elegível ao vencedor entre:
        //  (a) NFTs possuídas passadas em boost_nft_ids (PRIZE_BOOST owns; FIXED ou
        //      SCHEMA_FIELD — o worker as ordena por payout);
        //  (b) grants BURN_TO_CLAIM ativos do vencedor (PRIZE_BOOST burned, sempre FIXED —
        //      o asset foi queimado, não há schema p/ ler). Os grants são descobertos
        //      on-chain por owner (o worker não precisa passá-los).
        {
            nftconfigs_table _bconfigs(get_self(), get_self().value);
            uint16_t best_boost = 0; // hundredths (100 = 1.00×); só aplica se > 100

            // (a) NFTs possuídas
            if (boost_nft_ids.has_value() && !boost_nft_ids.value().empty()) {
                atomic_assets_table winner_nfts("atomicassets"_n, winner.value);
                for (uint64_t boost_id : boost_nft_ids.value()) {
                    auto nft_itr = winner_nfts.find(boost_id);
                    if (nft_itr == winner_nfts.end()) continue; // não pertence: ignora
                    auto conf_itr = _bconfigs.find((uint64_t)nft_itr->template_id);
                    if (conf_itr == _bconfigs.end()) continue;
                    if (conf_itr->collection_name != nft_itr->collection_name) continue;
                    for (const auto& r : conf_itr->rules) {
                        if (r.type != RULE_PRIZE_BOOST) continue;
                        if (r.condition != COND_OWNS) continue;
                        if (r.value_origin == VALUE_FIXED) {
                            if (r.fixed_value > best_boost) best_boost = r.fixed_value;
                        } else { // VALUE_SCHEMA_FIELD
                            uint64_t v = 0;
                            if (_read_schema_numeric(nft_itr->collection_name,
                                    nft_itr->schema_name,
                                    nft_itr->template_id,
                                    nft_itr->immutable_serialized_data,
                                    r.schema_field, v)) {
                                if (v > 25500) v = 25500;
                                if ((uint16_t)v > best_boost) best_boost = (uint16_t)v;
                            }
                        }
                    }
                }
            }

            // (b) grants BURN_TO_CLAIM ativos (benefício burned é sempre FIXED)
            {
                nft_grants_table grants(get_self(), get_self().value);
                auto gidx = grants.get_index<"byowner"_n>();
                uint32_t now_sec = current_time_point().sec_since_epoch();
                for (auto it = gidx.lower_bound(winner.value);
                     it != gidx.end() && it->owner == winner; ++it) {
                    if (it->grant_until.sec_since_epoch() <= now_sec) continue; // expirado
                    auto conf_itr = _bconfigs.find(it->template_id);
                    if (conf_itr == _bconfigs.end()) continue;
                    for (const auto& r : conf_itr->rules) {
                        if (r.type != RULE_PRIZE_BOOST) continue;
                        if (r.condition != COND_BURNED) continue;
                        if (r.value_origin != VALUE_FIXED) continue;
                        if (r.fixed_value > best_boost) best_boost = r.fixed_value;
                    }
                }
            }

            if (best_boost > 100) {
                payout.quantity.amount = payout.quantity.amount * (int64_t)best_boost / 100;
            }
        }

        if (payout.quantity.amount > 0) {
            // ADR-028 §7: em sala patrocinada, o payout é debitado do room_treasury
            // (nunca do house balance). Sala house: comportamento legado.
            if (game_itr->room_id != 0) {
                rooms_table rooms(get_self(), get_self().value);
                auto room_itr = rooms.find(game_itr->room_id);
                if (room_itr != rooms.end() && room_itr->sponsor_room) {
                    room_treasuries_table treasuries(get_self(), get_self().value);
                    auto t_itr = treasuries.require_find(game_itr->room_id,
                        "Treasury da sala patrocinada nao encontrado.");
                    check(t_itr->balance.quantity.symbol == payout.quantity.symbol &&
                          t_itr->balance.contract == payout.contract,
                        "Token do payout difere do treasury da sala.");
                    check(t_itr->balance >= payout,
                        "Treasury da sala sem saldo para cobrir o payout.");
                    treasuries.modify(t_itr, same_payer, [&](auto& t) { t.balance -= payout; });
                }
            }

            auto bal_itr = balances.find(payout.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = payout; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += payout; });
            }
            // ADR-005: acumula payout do total_wagered para cálculo do GGR em closegame
            games.modify(game_itr, same_payer, [&](auto& g) { g.total_paid += payout.quantity.amount; });
            // ADR-05x: evento de auditoria — valor pago por vencedor (visível no waxblock entries).
            action(
                permission_level{get_self(), "active"_n},
                get_self(),
                "prizepaid"_n,
                std::make_tuple(game_id, ticket_id, winner, payout)
            ).send();
            // IDEMPOTÊNCIA (ADR-036): marca ticket como pago p/ bloquear reenvios.
            {
                auto t_itr = tickets.find(ticket_id);
                if (t_itr != tickets.end())
                    tickets.modify(t_itr, same_payer, [&](auto& t) { t.state |= TICKET_STATE_PAID; });
            }
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
    // CLAIM WIN BATCH — Fase 2 Pagamento Batch (#369)
    //
    // Paga N vencedores limpos (sem boost NFT/grant) em uma única tx.
    // Reusa a validação de claimwin por entry, SEM seção de boost.
    // Fail-fast: qualquer erro invalida todo o lote.
    // Fail-atomic: balances e total_paid acumulam iterativamente;
    //   se um entry falhar AFTER creditação parcial, a tx reverte
    //   inteiramente (behavior padrão do Antelope).
    // ==========================================

    void bingo_contract::claimwinbatch(uint64_t game_id, std::vector<win_entry> entries) {
        require_auth("bingogamesvc"_n);
        check(!entries.empty(), "claimwinbatch requer pelo menos 1 entry.");

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(
            game_itr->status == "drawn"_n || game_itr->status == "paying"_n,
            "Game deve estar em DRAWN ou PAYING para pagar vencedores."
        );

        // ADR-030: permite pagar jogo arquivado SEM pagamento (total_paid==0)
        bool archived_unpaid = game_itr->status == "archived"_n && game_itr->total_paid == 0;
        check(
            game_itr->status == "drawn"_n
         || game_itr->status == "paying"_n
         || archived_unpaid,
            "Game deve estar em DRAWN, PAYING ou ARCHIVED(não pago) para pagar vencedores."
        );

        if (archived_unpaid) {
            games.modify(game_itr, same_payer, [&](auto& g) { g.status = "paying"_n; });
            game_itr = games.find(game_id);
        }

        if (game_itr->status == "drawn"_n) {
            games.modify(game_itr, same_payer, [&](auto& g) { g.status = "paying"_n; });
            game_itr = games.find(game_id);
        }

        gametypes_table gametypes(get_self(), get_self().value);
        auto gt_itr = gametypes.require_find(game_itr->gametype_id, "gametype_id invalido no jogo.");

        tickets_table tickets(get_self(), game_id);

        for (const auto& entry : entries) {
            auto ticket_itr = tickets.require_find(entry.ticket_id, "Ticket not found.");

            // IDEMPOTÊNCIA (ADR-036): rejeita ticket já pago — evita double-pay on-chain.
            check(!(ticket_itr->state & TICKET_STATE_PAID), "ticket ja pago (idempotencia).");

            name winner = ticket_itr->owner;
            balances_table balances(get_self(), winner.value);

            // Valida win_weight on-chain (anti-inflação — same as claimwin)
            uint16_t win_weight = 0;
            for (const auto& rule : gt_itr->rules) {
                patterns_table patterns(get_self(), get_self().value);
                auto pat_itr = patterns.find(rule.pattern_id);
                if (pat_itr != patterns.end() && (uint64_t)pat_itr->mask == entry.win_pattern_mask) {
                    win_weight = rule.weight;
                    if (gt_itr->master_weight_ovrd > 0 && (uint64_t)pat_itr->mask == 0x1FFFFFF) {
                        win_weight = gt_itr->master_weight_ovrd;
                    }
                    break;
                }
            }
            check(win_weight > 0, "win_pattern_mask nao corresponde a nenhum padrao do gametype.");

            // Calcula payout — SEM boost (batch é clean only)
            extended_asset payout = ticket_itr->price.quantity.amount > 0
                ? ticket_itr->price
                : game_itr->ticket_price;
            payout.quantity.amount =
                payout.quantity.amount * (int64_t)gt_itr->base_multiplier * (int64_t)win_weight / 100;

            if (entry.golden_multiplier > 1) {
                payout.quantity.amount *= (int64_t)entry.golden_multiplier;
            }

            if (payout.quantity.amount > 0) {
                // Sala patrocinada: debita do room_treasury
                if (game_itr->room_id != 0) {
                    rooms_table rooms(get_self(), get_self().value);
                    auto room_itr = rooms.find(game_itr->room_id);
                    if (room_itr != rooms.end() && room_itr->sponsor_room) {
                        room_treasuries_table treasuries(get_self(), get_self().value);
                        auto t_itr = treasuries.require_find(game_itr->room_id,
                            "Treasury da sala patrocinada nao encontrado.");
                        check(t_itr->balance.quantity.symbol == payout.quantity.symbol &&
                              t_itr->balance.contract == payout.contract,
                            "Token do payout difere do treasury da sala.");
                        check(t_itr->balance >= payout,
                            "Treasury da sala sem saldo para cobrir o payout.");
                        treasuries.modify(t_itr, same_payer, [&](auto& t) { t.balance -= payout; });
                    }
                }

                auto bal_itr = balances.find(payout.quantity.symbol.code().raw());
                if (bal_itr == balances.end()) {
                    balances.emplace(get_self(), [&](auto& b) { b.balance = payout; });
                } else {
                    balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += payout; });
                }

                // ADR-005: acumula payout para cálculo do GGR em closegame
                game_itr = games.find(game_id);
                games.modify(game_itr, same_payer, [&](auto& g) { g.total_paid += payout.quantity.amount; });
                // ADR-05x: evento de auditoria — valor pago por vencedor (visível no waxblock entries).
                action(
                    permission_level{get_self(), "active"_n},
                    get_self(),
                    "prizepaid"_n,
                    std::make_tuple(game_id, entry.ticket_id, winner, payout)
                ).send();
                // IDEMPOTÊNCIA (ADR-036): marca ticket como pago p/ bloquear reenvios.
                {
                    auto t_itr = tickets.find(entry.ticket_id);
                    if (t_itr != tickets.end())
                        tickets.modify(t_itr, same_payer, [&](auto& t) { t.state |= TICKET_STATE_PAID; });
                }
            }

            // Sponsor pool credits — same per winner as claimwin
            game_itr = games.find(game_id);
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
        }
        // Jogo permanece em "paying". Worker chama closegame() após o lote.
    }

    // ==========================================
    // PRIZEPAID EVENT (ADR-05x) — auditoria on-chain do valor pago
    // Emitido via SEND_INLINE_ACTION por claimwin/claimwinbatch APÓS creditar o saldo.
    // require_auth(get_self()) garante que SÓ o próprio contrato emite este evento
    // (ninguém de fora pode poluir o action log com valores falsos).
    // ==========================================
    void bingo_contract::prizepaid(uint64_t game_id, uint64_t ticket_id, name winner, extended_asset payout) {
        require_auth(get_self());
    }

    // ==========================================
    // CLOSE GAME (ADR-012)
    // Chamado pelo worker após todos os claimwin do lote.
    // Aceita paying|drawn (drawn: jogo sem vencedores encerrado diretamente).
    // ==========================================

    void bingo_contract::closegame(uint64_t game_id) {
        require_auth("bingogamesvc"_n);
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");

        bool needs_archive = game_itr->status == "paying"_n || game_itr->status == "drawn"_n;
        // Aceita também games já arquivados para corrigir current_game_id da sala (recovery)
        bool already_done  = game_itr->status == "archived"_n;
        check(needs_archive || already_done,
            "Game deve estar em PAYING, DRAWN ou ARCHIVED para closegame.");

        // Libera o slot da sala + detecta economia de sala patrocinada (ADR-028)
        bool     is_sponsor_room = false;
        uint16_t house_fee_bps   = 0;
        if (game_itr->room_id != 0) {
            rooms_table rooms(get_self(), get_self().value);
            auto room_itr = rooms.find(game_itr->room_id);
            if (room_itr != rooms.end()) {
                is_sponsor_room = room_itr->sponsor_room;
                if (room_itr->house_fee_bps.has_value()) house_fee_bps = room_itr->house_fee_bps.value();
                if (room_itr->current_game_id == game_id) {
                    rooms.modify(room_itr, same_payer, [&](auto& r) { r.current_game_id = 0; });
                }
            }
        }

        if (needs_archive) {
            int64_t ggr_amount = game_itr->total_wagered.quantity.amount - game_itr->total_paid;
            if (ggr_amount > 0) {
                ggr_pool_table ggr_pool(get_self(), get_self().value);
                auto ggr_key = game_itr->total_wagered.quantity.symbol.code().raw();

                if (is_sponsor_room) {
                    // ADR-028 §5: o lucro fica no treasury do sponsor; a casa retém
                    // apenas house_fee_bps do GGR, debitado do treasury.balance.
                    int64_t house_fee = (int64_t)(((__int128)ggr_amount * house_fee_bps) / 10000);
                    if (house_fee > 0) {
                        room_treasuries_table treasuries(get_self(), get_self().value);
                        auto t_itr = treasuries.find(game_itr->room_id);
                        if (t_itr != treasuries.end() && t_itr->balance.quantity.amount >= house_fee) {
                            extended_asset fee_asset = game_itr->total_wagered;
                            fee_asset.quantity.amount = house_fee;
                            treasuries.modify(t_itr, same_payer, [&](auto& t) { t.balance -= fee_asset; });
                            auto ggr_itr = ggr_pool.find(ggr_key);
                            if (ggr_itr == ggr_pool.end()) {
                                ggr_pool.emplace(get_self(), [&](auto& r) { r.ggr = fee_asset; });
                            } else {
                                ggr_pool.modify(ggr_itr, same_payer, [&](auto& r) {
                                    r.ggr.quantity.amount += house_fee;
                                });
                            }
                        }
                    }
                } else {
                    // ADR-005: sala house — GGR inteiro acumula no pool da casa
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
        bool by_ms = has_auth("bingogamesvc"_n);
        if (!by_ms) require_auth(permission_level{get_self(), "admin"_n});

        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(
            game_itr->status == "created"_n ||
            game_itr->status == "funding"_n ||
            game_itr->status == "locked"_n  ||
            game_itr->status == "drawing"_n ||
            game_itr->status == "paying"_n,
            "Game deve estar em CREATED, FUNDING, LOCKED, DRAWING ou PAYING para ser abortado."
        );
        // Libera o slot da sala
        if (game_itr->room_id != 0) {
            rooms_table rooms(get_self(), get_self().value);
            auto room_itr = rooms.find(game_itr->room_id);
            if (room_itr != rooms.end() && room_itr->current_game_id == game_id) {
                rooms.modify(room_itr, same_payer, [&](auto& r) { r.current_game_id = 0; });
            }
        }

        // ADR-XXX: Se ninguém comprou cartela, deleta a row em vez de marcar aborted
        // — libera RAM do contrato sem necessidade de cleargame posterior.
        if (game_itr->total_wagered.quantity.amount == 0) {
            games.erase(game_itr);
            return;
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
    // CLEAR BATCH — limpa jogos ABORTED sem cartelas em lote
    // ==========================================

    void bingo_contract::clearbatch(const std::vector<uint64_t>& game_ids) {
        require_auth(permission_level{get_self(), "admin"_n});
        games_table games(get_self(), get_self().value);
        rooms_table rooms(get_self(), get_self().value);

        for (auto g : game_ids) {
            auto itr = games.find(g);
            check(itr != games.end(), ("clearbatch: game " + std::to_string(g) + " not found").c_str());
            check(itr->status == "aborted"_n,
                ("clearbatch: game " + std::to_string(g) + " not in ABORTED status").c_str());
            check(itr->total_wagered.quantity.amount == 0,
                ("clearbatch: game " + std::to_string(g) + " has tickets sold — use cleargame").c_str());
            // Libera o slot da sala
            if (itr->room_id != 0) {
                auto room_itr = rooms.find(itr->room_id);
                if (room_itr != rooms.end() && room_itr->current_game_id == g) {
                    rooms.modify(room_itr, same_payer, [&](auto& r) { r.current_game_id = 0; });
                }
            }
            games.erase(itr);
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
        if (!by_admin && !by_sponsor) require_auth(permission_level{get_self(), "admin"_n});

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
        if (!by_admin && !by_sponsor) require_auth(permission_level{get_self(), "admin"_n});

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

    void bingo_contract::setcampaign(uint64_t campaign_id, extended_asset payout_per_game, name leftover_policy) {
        campaigns_table campaigns(get_self(), get_self().value);
        auto camp_itr = campaigns.require_find(campaign_id, "campaign_id nao encontrado.");
        bool by_admin   = has_auth(get_self());
        bool by_sponsor = has_auth(camp_itr->sponsor);
        if (!by_admin && !by_sponsor) require_auth(permission_level{get_self(), "admin"_n});

        check(payout_per_game.quantity.amount > 0, "payout_per_game deve ser > 0.");
        check(
            leftover_policy == "refund"_n || leftover_policy == "house"_n,
            "leftover_policy deve ser refund ou house."
        );

        campaigns.modify(camp_itr, same_payer, [&](auto& c) {
            c.payout_per_game = payout_per_game;
            c.leftover_policy = leftover_policy;
        });
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
        require_auth(permission_level{get_self(), "admin"_n});

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
        // Os 3 preços devem usar o mesmo token (símbolo + contract)
        check(ticket_price_min.quantity.symbol == ticket_price_max.quantity.symbol &&
              ticket_price_max.quantity.symbol == ticket_price_default.quantity.symbol,
            "Os tres precos devem usar o mesmo token (simbolo).");
        check(ticket_price_min.contract == ticket_price_max.contract &&
              ticket_price_max.contract == ticket_price_default.contract,
            "Os tres precos devem usar o mesmo contract.");

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
            // ADR-028 §4: defaults dos campos de economia de sala patrocinada
            r.nft_template_allowlist.emplace(std::vector<uint64_t>{});
            r.campaign_id.emplace(0);
            r.house_fee_bps.emplace(0);
            r.estimated_monthly_tickets.emplace(0);
        });
    }

    void bingo_contract::activateroom(uint64_t room_id) {
        require_auth(permission_level{get_self(), "admin"_n});
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(
            room_itr->status == "inactive"_n || room_itr->status == "paused"_n,
            "activateroom: sala deve estar em inactive ou paused."
        );

        // ADR-028 §5: sala patrocinada exige colateral no treasury cobrindo o
        // pior caso de payout (RTP worst-case) antes de ativar.
        if (room_itr->sponsor_room) {
            uint32_t est_tickets = room_itr->estimated_monthly_tickets.has_value()
                ? room_itr->estimated_monthly_tickets.value() : 0;

            // max multiplier do gametype = base_multiplier × maior weight (hundredths)
            gametypes_table gametypes(get_self(), get_self().value);
            auto gt_itr = gametypes.require_find(room_itr->gametype_id, "gametype_id da sala invalido.");
            uint32_t max_weight = 0;
            for (const auto& r : gt_itr->rules)  if (r.weight > max_weight) max_weight = r.weight;
            for (const auto& s : gt_itr->stages) if (s.weight > max_weight) max_weight = s.weight;
            if (gt_itr->combinations.has_value())
                for (const auto& c : gt_itr->combinations.value())
                    if (c.weight > max_weight) max_weight = c.weight;

            // required = est_tickets × ticket_price_max × base_multiplier × max_weight / 100
            __int128 required = (__int128)est_tickets
                * (__int128)room_itr->ticket_price_max.quantity.amount
                * (__int128)gt_itr->base_multiplier
                * (__int128)max_weight / 100;

            if (required > 0) {
                check(max_weight > 0, "gametype sem weight valido para colateral.");
                room_treasuries_table treasuries(get_self(), get_self().value);
                auto t_itr = treasuries.require_find(room_id,
                    "Treasury vazio: deposite colateral (memo room:<id>) antes de ativar.");
                check(t_itr->balance.quantity.symbol == room_itr->ticket_price_max.quantity.symbol,
                    "Token do treasury difere do preco da sala.");

                __int128 total = (__int128)t_itr->balance.quantity.amount
                               + (__int128)t_itr->locked.quantity.amount;
                check(total >= required, "Colateral insuficiente no treasury para ativar a sala.");

                // trava exatamente `required`; excedente volta a ficar disponível
                int64_t req64 = (int64_t)required;
                treasuries.modify(t_itr, same_payer, [&](auto& t) {
                    t.locked.quantity.amount  = req64;
                    t.balance.quantity.amount = (int64_t)(total - required);
                });
            }
        }

        rooms.modify(room_itr, same_payer, [&](auto& r) { r.status = "active"_n; });
    }

    void bingo_contract::pauseroom(uint64_t room_id) {
        require_auth(permission_level{get_self(), "admin"_n});
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status == "active"_n, "pauseroom: sala deve estar ativa.");
        rooms.modify(room_itr, same_payer, [&](auto& r) { r.status = "paused"_n; });
    }

    void bingo_contract::closeroom(uint64_t room_id) {
        require_auth(permission_level{get_self(), "admin"_n});
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status != "closed"_n, "closeroom: sala ja esta fechada.");
        // Não pode fechar com partida ativa
        check(room_itr->current_game_id == 0,
            "closeroom: aguarde a partida corrente terminar antes de fechar a sala.");
        rooms.modify(room_itr, same_payer, [&](auto& r) { r.status = "closed"_n; });

        // ADR-028 §5: ao fechar, libera o colateral travado para que o sponsor
        // possa sacar o saldo total via withdrawroom.
        if (room_itr->sponsor_room) {
            room_treasuries_table treasuries(get_self(), get_self().value);
            auto t_itr = treasuries.find(room_id);
            if (t_itr != treasuries.end() && t_itr->locked.quantity.amount > 0) {
                treasuries.modify(t_itr, same_payer, [&](auto& t) {
                    t.balance.quantity.amount += t.locked.quantity.amount;
                    t.locked.quantity.amount = 0;
                });
            }
        }
    }

    void bingo_contract::setroommeta(uint64_t room_id, uint16_t room_drop_chance_bps, uint32_t max_tickets_per_player, uint8_t difficulty) {
        require_auth(permission_level{get_self(), "admin"_n});
        check(room_drop_chance_bps <= 10000, "room_drop_chance_bps deve ser 0–10000.");
        check(max_tickets_per_player <= 1000,
            "max_tickets_per_player maximo é 1000 (0 = sem limite).");
        check(difficulty <= 10, "difficulty deve ser 0-10.");
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status != "closed"_n, "Sala fechada nao pode ser alterada.");
        rooms.modify(room_itr, same_payer, [&](auto& r) {
            r.room_drop_chance_bps   = room_drop_chance_bps;
            r.max_tickets_per_player = max_tickets_per_player;
            r.difficulty.emplace(difficulty > 0 ? difficulty : 1);
        });
    }

    // Altera os preços de ticket de uma sala existente.
    // Mesma validação do createroom; bloqueia se há jogo em andamento.
    void bingo_contract::updateroom(
        uint64_t       room_id,
        extended_asset ticket_price_min,
        extended_asset ticket_price_max,
        extended_asset ticket_price_default
    ) {
        require_auth(get_self());
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status != "closed"_n, "Sala fechada nao pode ser alterada.");
        // Permite editar preços se a sala não está ativa (pausada/inativa): nessas
        // situações não há jogo em andamento de fato, mesmo que current_game_id
        // retenha o id do último jogo (pauseroom não o zera). Só bloqueia quando
        // status=='active' E há jogo corrente (current_game_id != 0).
        // Issue #236.
        check(room_itr->status != "active"_n || room_itr->current_game_id == 0,
            "Sala com jogo em andamento nao pode ter precos alterados.");

        // Validação (igual createroom)
        check(ticket_price_min.quantity.amount > 0, "ticket_price_min deve ser maior que zero.");
        check(ticket_price_max.quantity.amount >= ticket_price_min.quantity.amount,
            "ticket_price_max deve ser >= ticket_price_min.");
        check(ticket_price_default.quantity.amount >= ticket_price_min.quantity.amount &&
              ticket_price_default.quantity.amount <= ticket_price_max.quantity.amount,
            "ticket_price_default deve estar entre min e max.");
        // Os 3 preços devem usar o mesmo token (símbolo + contract)
        check(ticket_price_min.quantity.symbol == ticket_price_max.quantity.symbol &&
              ticket_price_max.quantity.symbol == ticket_price_default.quantity.symbol,
            "Os tres precos devem usar o mesmo token (simbolo).");
        check(ticket_price_min.contract == ticket_price_max.contract &&
              ticket_price_max.contract == ticket_price_default.contract,
            "Os tres precos devem usar o mesmo contract.");

        rooms.modify(room_itr, same_payer, [&](auto& r) {
            r.ticket_price_min     = ticket_price_min;
            r.ticket_price_max     = ticket_price_max;
            r.ticket_price_default = ticket_price_default;
        });
    }

    // ADR-028 §4: configura economia da sala patrocinada (allowlist de templates
    // NFT, vínculo de campanha, taxa da casa e projeção de tickets p/ colateral).
    void bingo_contract::setroomnft(uint64_t room_id, std::vector<uint64_t> nft_template_allowlist, uint64_t campaign_id, uint16_t house_fee_bps, uint32_t estimated_monthly_tickets) {
        require_auth(permission_level{get_self(), "admin"_n});
        check(house_fee_bps <= 10000, "house_fee_bps deve ser 0–10000.");
        check(nft_template_allowlist.size() <= 100, "allowlist: maximo 100 templates.");
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        check(room_itr->status != "closed"_n, "Sala fechada nao pode ser alterada.");
        rooms.modify(room_itr, same_payer, [&](auto& r) {
            r.nft_template_allowlist.emplace(nft_template_allowlist);
            r.campaign_id.emplace(campaign_id);
            r.house_fee_bps.emplace(house_fee_bps);
            r.estimated_monthly_tickets.emplace(estimated_monthly_tickets);
        });
    }

    // ADR-028 §5: sponsor saca saldo disponível (não-travado) do treasury da sala.
    // `locked` (colateral) não é sacável enquanto travado.
    void bingo_contract::withdrawroom(uint64_t room_id, extended_asset amount) {
        rooms_table rooms(get_self(), get_self().value);
        auto room_itr = rooms.require_find(room_id, "room_id nao encontrado.");
        require_auth(room_itr->sponsor);
        check(amount.quantity.amount > 0, "amount deve ser maior que zero.");

        room_treasuries_table treasuries(get_self(), get_self().value);
        auto t_itr = treasuries.require_find(room_id, "Treasury da sala nao encontrado.");
        check(t_itr->balance.quantity.symbol == amount.quantity.symbol &&
              t_itr->balance.contract == amount.contract,
            "Token do saque difere do treasury.");
        check(t_itr->balance >= amount, "Saldo disponivel insuficiente (locked nao e sacavel).");

        treasuries.modify(t_itr, same_payer, [&](auto& t) { t.balance -= amount; });

        action(
            permission_level{get_self(), "active"_n},
            amount.contract, "transfer"_n,
            std::make_tuple(get_self(), room_itr->sponsor, amount.quantity,
                std::string("Saque treasury sala #" + std::to_string(room_id)))
        ).send();
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
        if (!by_owner && !by_admin) require_auth(permission_level{get_self(), "admin"_n});
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
        if (!by_owner && !by_admin) require_auth(permission_level{get_self(), "admin"_n});
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
     * Chamada pelo worker (bingogamesvc) após seleção do vencedor (ADR-011 Fase 2).
     * Para tokens: credita na wallet interna do vencedor.
     * Para NFTs:   transfere o NFT diretamente para a wallet do vencedor.
     */
    void bingo_contract::execdrop(uint64_t alloc_id, name winner, extended_asset quantity) {
        require_auth("bingogamesvc"_n);

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
    // USERLOGIN — Autenticação off-chain (ADR-006)
    // ==========================================

    void bingo_contract::userlogin(const std::vector<char>& nonce_data) {
        check(nonce_data.size() <= 256, "userlogin: nonce_data too large");
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
    // Auth: apenas bingogamectr (admin).
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
