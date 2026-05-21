#pragma once

#include <eosio/eosio.hpp>

namespace orng {

    class [[eosio::contract("orngmock")]] orng_mock : public eosio::contract {
    public:
        using contract::contract;

        [[eosio::action]]
        void requestrand(uint64_t assoc_id, uint64_t signing_value, eosio::name caller);

        [[eosio::action]]
        void fulfillrand(uint64_t assoc_id);

    private:
        struct [[eosio::table]] request_record {
            uint64_t assoc_id;
            eosio::name caller;

            uint64_t primary_key() const { return assoc_id; }
        };
        typedef multi_index<"requests"_n, request_record> requests_table;
    };

}
