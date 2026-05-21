#pragma once

#include <eosio/eosio.hpp>

namespace orng {
    using namespace eosio;

    class [[eosio::contract("orngmock")]] orng_mock : public contract {
    public:
        using contract::contract;

        [[eosio::action]]
        void requestrand(uint64_t assoc_id, uint64_t signing_value, name caller);

        [[eosio::action]]
        void fulfillrand(uint64_t assoc_id);

    private:
        struct [[eosio::table]] request_record {
            uint64_t assoc_id;
            name caller;

            uint64_t primary_key() const { return assoc_id; }
        };
        typedef multi_index<"requests"_n, request_record> requests_table;
    };
}