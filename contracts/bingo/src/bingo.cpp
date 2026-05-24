#include <bingo.hpp>

namespace bingo {

    void bingo_contract::setconfig(public_key signer_key) {
        require_auth(get_self()); 
        config_singleton config_table(get_self(), get_self().value);
        config_state config = { signer_key };
        config_table.set(config, get_self());
    }

    void bingo_contract::creategame(uint64_t game_id, extended_asset ticket_price) {
        require_auth(get_self()); 
        games_table games(get_self(), get_self().value);
        check(games.find(game_id) == games.end(), "Game ID already exists.");

        games.emplace(get_self(), [&](auto& g) {
            g.game_id = game_id;
            g.status = "funding"_n; 
            g.ticket_price = ticket_price;
            g.prize_pool = extended_asset(asset(0, ticket_price.quantity.symbol), ticket_price.contract);
        });
    }

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

    void bingo_contract::deposit(name from, name to, eosio::asset quantity, std::string memo) {
        if (from == get_self() || to != get_self()) return;
        
        name token_contract = get_first_receiver(); 
        // Em produção Mainnet, limitaremos a token_contract == "bingo.token"_n
        check(quantity.amount > 0, "A quantidade deve ser maior que zero.");

        extended_asset deposit_asset(quantity, token_contract);

        balances_table balances(get_self(), from.value);
        auto bal_itr = balances.find(deposit_asset.quantity.symbol.code().raw());
        
        if (bal_itr == balances.end()) {
            balances.emplace(get_self(), [&](auto& b) { b.balance = deposit_asset; });
        } else {
            balances.modify(bal_itr, get_self(), [&](auto& b) { b.balance += deposit_asset; });
        }
    }

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
        total_cost.quantity.amount *= matrices.size();

        if (total_cost.quantity.amount > 0) {
            // Validação de Utilitário de NFT (Descontos Dinâmicos)
            if (nft_id != 0) {
                atomic_assets_table buyer_nfts("atomicassets"_n, buyer.value);
                auto nft_itr = buyer_nfts.require_find(nft_id, "O NFT informado nao pertence a sua carteira.");
                check(nft_itr->collection_name == "cryptobingo"_n, "NFT nao pertence a colecao oficial.");

                nftconfigs_table _configs(get_self(), get_self().value);
                auto conf_itr = _configs.find(nft_itr->template_id);
                if (conf_itr != _configs.end()) {
                    if (conf_itr->valid_until > 0) {
                        check(current_time_point().sec_since_epoch() <= conf_itr->valid_until, "A utilidade deste NFT expirou.");
                    }
                    if (conf_itr->discount_pct > 0) {
                        int64_t discount_amount = (total_cost.quantity.amount * conf_itr->discount_pct) / 100;
                        total_cost.quantity.amount -= discount_amount;
                    }
                }
            }

            balances_table balances(get_self(), buyer.value);
            auto bal_itr = balances.require_find(total_cost.quantity.symbol.code().raw(), "Saldo insuficiente: Token nao registrado na wallet.");
            check(bal_itr->balance >= total_cost, "Saldo insuficiente: Deposite fundos.");

            balances.modify(bal_itr, same_payer, [&](auto& b) {
                b.balance -= total_cost;
            });

            games.modify(game_itr, get_self(), [&](auto& g) {
                g.prize_pool += total_cost;
            });
        }

        // Validação Criptográfica e Inserção
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
                t.owner = buyer;
                t.matrix = matrices[i];
                t.state = 0x00001000; 
                t.game_id = game_id;
            });
        }
    }

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
            "orng.wax"_n,
            "requestrand"_n,
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
            g.status = "drawn"_n; 
        });
    }

    void bingo_contract::claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask) {
        require_auth("microservice"_n); 
        games_table games(get_self(), get_self().value);
        auto game_itr = games.require_find(game_id, "Game not found.");
        check(game_itr->status == "drawn"_n, "Game is not in DRAWN status.");

        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.require_find(ticket_id, "Ticket not found."); 

        name winner = ticket_itr->owner;
        balances_table balances(get_self(), winner.value);

        extended_asset rtp = game_itr->prize_pool;
        rtp.quantity.amount = (rtp.quantity.amount * 85) / 100;

        if (rtp.quantity.amount > 0) {
            auto bal_itr = balances.find(rtp.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = rtp; });
            } else {
                balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance += rtp; });
            }
        }

        for (const auto& sponsor_asset : game_itr->sponsor_pool) {
            if (sponsor_asset.quantity.amount > 0) {
                auto sponsor_bal_itr = balances.find(sponsor_asset.quantity.symbol.code().raw());
                if (sponsor_bal_itr == balances.end()) {
                    balances.emplace(get_self(), [&](auto& b) { b.balance = sponsor_asset; });
                } else {
                    balances.modify(sponsor_bal_itr, same_payer, [&](auto& b) { b.balance += sponsor_asset; });
                }
            }
        }

        games.modify(game_itr, same_payer, [&](auto& g) { g.status = "archived"_n; });
    }

    void bingo_contract::withdraw(name owner, extended_asset amount) {
        require_auth(owner); 
        balances_table balances(get_self(), owner.value);
        auto bal_itr = balances.require_find(amount.quantity.symbol.code().raw(), "Nenhum saldo encontrado para este token.");
        check(bal_itr->balance >= amount, "Saldo insuficiente para saque.");

        balances.modify(bal_itr, same_payer, [&](auto& b) { b.balance -= amount; });

        action(
            permission_level{get_self(), "active"_n},
            amount.contract,
            "transfer"_n,
            std::make_tuple(get_self(), owner, amount.quantity, std::string("Saque via CryptoBingo"))
        ).send();
    }
}