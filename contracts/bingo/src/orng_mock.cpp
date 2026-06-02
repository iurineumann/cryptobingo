#include <orng_mock.hpp>

namespace orng {
    using namespace eosio;

    // Mock do oráculo WAX para ambiente de desenvolvimento.
    //
    // O oráculo real (orng.wax em produção) recebe requestrand e responde
    // assincronamente via deferred transaction com receiverand.
    //
    // Este mock replica o contrato real respondendo inline dentro da mesma
    // transação — comportamento equivalente do ponto de vista do contrato caller.
    //
    // Bytes gerados: shuffled via assoc_id como seed, mantendo unicidade.
    // A lógica de shuffle garante que cada bingo card recebe uma sequência
    // diferente por partida, evitando resultados determinísticos triviais.
    void orng_mock::requestrand(uint64_t assoc_id, uint64_t signing_value, name caller) {
        require_auth(caller);

        // Gera 75 bytes com shuffle baseado em assoc_id como seed
        std::vector<char> balls(75);
        for (uint8_t i = 0; i < 75; ++i) balls[i] = (char)(i + 1);

        // Fisher-Yates shuffle usando assoc_id como seed
        uint64_t seed = assoc_id ^ (assoc_id >> 33) ^ 0xdeadbeefcafe1337ULL;
        for (int i = 74; i > 0; --i) {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            int j = (int)(seed % (uint64_t)(i + 1));
            char tmp = balls[i]; balls[i] = balls[j]; balls[j] = tmp;
        }

        action(
            permission_level{get_self(), "active"_n},
            caller,
            "receiverand"_n,
            std::make_tuple(assoc_id, balls)
        ).send();
    }
}
