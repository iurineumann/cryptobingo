#include <bingo.hpp>

namespace bingo {

    void bingo_contract::buytickets(name owner, uint64_t game_id, std::vector<std::vector<uint8_t>> matrices, std::vector<signature> signatures) {
        // 1. Autorização da conta pagadora
        require_auth(owner);

        // 2. Acesso à Tabela de Jogos (Escopo Global)
        games_table games(get_self(), get_self().value);
        auto game_itr = games.find(game_id);
        check(game_itr != games.end(), "Game not found.");
        check(game_itr->status == "funding"_n, "Game is not in FUNDING status.");

        // 3. Validação de Tamanho
        check(matrices.size() == signatures.size(), "Matrices and signatures size mismatch.");
        check(matrices.size() > 0, "No matrices provided.");

        // 4. Recuperação da Chave Pública (Singleton)
        config_singleton config_table(get_self(), get_self().value);
        check(config_table.exists(), "Contract configuration (public key) not initialized.");
        auto config = config_table.get();

        // 5. Instanciação da Tabela de Cartelas (Escopo: game_id, conforme SPEC.md 1.3)
        tickets_table tickets(get_self(), game_id);

        // 6. Loop de Validação (Anti-Replay) e Gravação
        for (size_t i = 0; i < matrices.size(); ++i) {
            // Buffer estrito para serialização
            size_t buffer_size = matrices[i].size() + sizeof(uint64_t) + sizeof(name);
            std::vector<char> buffer(buffer_size);
            datastream<char*> ds(buffer.data(), buffer.size());
            
            // Serialização na ordem exata: matrix + game_id + owner
            ds << matrices[i] << game_id << owner;
            
            // Hashing e Validação da Assinatura ECDSA
            auto hash = eosio::sha256(buffer.data(), buffer.size());
            assert_recover_key(hash, signatures[i], config.signer_key);

            // Derivação Determinística do ticket_id a partir do hash criptográfico
            uint64_t generated_ticket_id;
            memcpy(&generated_ticket_id, hash.data(), sizeof(uint64_t));

            // Garante que a mesma assinatura não foi re-enviada nesta rodada
            check(tickets.find(generated_ticket_id) == tickets.end(), "Ticket signature replay detected.");

            // Gravação na RAM
            tickets.emplace(get_self(), [&](auto& t) {
                t.ticket_id = generated_ticket_id;
                t.owner = owner;
                t.matrix = matrices[i];
                t.state = 0x00001000; // Bitmask inicial (Posição 12 - FREE SPACE - ativada)
                t.game_id = game_id;
            });
        }

        // 7. Lógica Financeira (Wallet Interna)
        extended_asset total_cost = game_itr->ticket_price;
        total_cost.quantity.amount *= matrices.size();

        if (total_cost.quantity.amount > 0) {
            // Escopo: dono da conta (SPEC.md 1.1)
            balances_table balances(get_self(), owner.value);
            auto bal_itr = balances.find(total_cost.quantity.symbol.code().raw());
            
            check(bal_itr != balances.end(), "Insufficient balance: Token not registered in wallet.");
            check(bal_itr->balance >= total_cost, "Insufficient balance: Not enough funds.");

            // Dedução do saldo
            balances.modify(bal_itr, get_self(), [&](auto& b) {
                b.balance -= total_cost;
            });

            // Incremento do Prize Pool
            games.modify(game_itr, get_self(), [&](auto& g) {
                g.prize_pool += total_cost;
            });
        }
    }

} // namespace bingo