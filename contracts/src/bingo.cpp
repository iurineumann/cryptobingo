#include <bingo.hpp>

namespace bingo {

    void bingo_contract::buytickets(name owner, uint64_t game_id, std::vector<std::vector<uint8_t>> matrices, std::vector<signature> signatures) {
        require_auth(owner);

        games_table games(get_self(), get_self().value);
        auto game_itr = games.find(game_id);
        check(game_itr != games.end(), "Game not found.");
        check(game_itr->status == "funding"_n, "Game is not in FUNDING status.");

        check(matrices.size() == signatures.size(), "Matrices and signatures size mismatch.");
        check(matrices.size() > 0, "No matrices provided.");

        config_singleton config_table(get_self(), get_self().value);
        check(config_table.exists(), "Contract configuration (public key) not initialized.");
        auto config = config_table.get();

        tickets_table tickets(get_self(), game_id);

        for (size_t i = 0; i < matrices.size(); ++i) {
            size_t buffer_size = matrices[i].size() + sizeof(uint64_t) + sizeof(name);
            std::vector<char> buffer(buffer_size);
            datastream<char*> ds(buffer.data(), buffer.size());
            
            ds << matrices[i] << game_id << owner;
            
            auto hash = eosio::sha256(buffer.data(), buffer.size());
            assert_recover_key(hash, signatures[i], config.signer_key);

            uint64_t generated_ticket_id;
            memcpy(&generated_ticket_id, hash.data(), sizeof(uint64_t));

            check(tickets.find(generated_ticket_id) == tickets.end(), "Ticket signature replay detected.");

            tickets.emplace(get_self(), [&](auto& t) {
                t.ticket_id = generated_ticket_id;
                t.owner = owner;
                t.matrix = matrices[i];
                t.state = 0x00001000; 
                t.game_id = game_id;
            });
        }

        extended_asset total_cost = game_itr->ticket_price;
        total_cost.quantity.amount *= matrices.size();

        if (total_cost.quantity.amount > 0) {
            balances_table balances(get_self(), owner.value);
            auto bal_itr = balances.find(total_cost.quantity.symbol.code().raw());
            
            check(bal_itr != balances.end(), "Insufficient balance: Token not registered in wallet.");
            check(bal_itr->balance >= total_cost, "Insufficient balance: Not enough funds.");

            balances.modify(bal_itr, get_self(), [&](auto& b) {
                b.balance -= total_cost;
            });

            games.modify(game_itr, get_self(), [&](auto& g) {
                g.prize_pool += total_cost;
            });
        }
    }

    void bingo_contract::lockgame(uint64_t game_id) {
        require_auth("microservice"_n); // Conforme spec de arquitetura isolada

        games_table games(get_self(), get_self().value);
        auto game_itr = games.find(game_id);
        check(game_itr != games.end(), "Game not found.");
        check(game_itr->status == "funding"_n, "Game is not in FUNDING status.");

        games.modify(game_itr, get_self(), [&](auto& g) {
            g.status = "locked"_n;
        });
    }

    void bingo_contract::claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask) {
        require_auth("microservice"_n); 

        games_table games(get_self(), get_self().value);
        auto game_itr = games.find(game_id);
        check(game_itr != games.end(), "Game not found.");
        check(game_itr->status == "drawing"_n, "Game is not in DRAWING status.");

        tickets_table tickets(get_self(), game_id);
        auto ticket_itr = tickets.find(ticket_id);
        check(ticket_itr != tickets.end(), "Ticket not found.");

        name winner = ticket_itr->owner;
        balances_table balances(get_self(), winner.value);

        // --- RTP: Cálculo Exato sem Precision Loss ---
        extended_asset rtp = game_itr->prize_pool;
        rtp.quantity.amount = (rtp.quantity.amount * 85) / 100;

        if (rtp.quantity.amount > 0) {
            auto bal_itr = balances.find(rtp.quantity.symbol.code().raw());
            if (bal_itr == balances.end()) {
                balances.emplace(get_self(), [&](auto& b) { b.balance = rtp; });
            } else {
                balances.modify(bal_itr, get_self(), [&](auto& b) { b.balance += rtp; });
            }
        }

        // --- Patrocínio (Multidrop B2B) ---
        for (const auto& sponsor_asset : game_itr->sponsor_pool) {
            if (sponsor_asset.quantity.amount > 0) {
                auto sponsor_bal_itr = balances.find(sponsor_asset.quantity.symbol.code().raw());
                if (sponsor_bal_itr == balances.end()) {
                    balances.emplace(get_self(), [&](auto& b) { b.balance = sponsor_asset; });
                } else {
                    balances.modify(sponsor_bal_itr, get_self(), [&](auto& b) { b.balance += sponsor_asset; });
                }
            }
        }

        games.modify(game_itr, get_self(), [&](auto& g) {
            g.status = "archived"_n;
        });
    }

} // namespace bingo