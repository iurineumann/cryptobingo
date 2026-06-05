#pragma once

#include <eosio/eosio.hpp>

namespace orng {
    using namespace eosio;

    // Mock do oráculo WAX para ambiente de desenvolvimento.
    // Replica o comportamento do orng.wax de produção:
    //   requestrand → responde inline com receiverand (sem deferred transaction).
    // Sem estado persistente — não há requests_table nem fulfillrand manual.
    class [[eosio::contract("orngmock")]] orng_mock : public contract {
    public:
        using contract::contract;

        [[eosio::action]]
        void requestrand(uint64_t assoc_id, uint64_t signing_value, name caller);
    };
}
