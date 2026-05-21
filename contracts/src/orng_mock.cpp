#include <orng_mock.hpp>

namespace orng {

    void orng_mock::requestrand(uint64_t assoc_id, uint64_t signing_value, eosio::name caller) {
        require_auth(caller);

        requests_table requests(get_self(), get_self().value);
        requests.emplace(_self, [&](auto& req) {
            req.assoc_id = assoc_id;
            req.caller = caller;
        });
    }

    void orng_mock::fulfillrand(uint64_t assoc_id) {
        require_auth(get_self());

        requests_table requests(get_self(), get_self().value);
        auto request_itr = requests.find(assoc_id);
        check(request_itr != requests.end(), "Request not found.");

        std::vector<uint8_t> random_bytes(75);
        for (uint8_t i = 1; i <= 75; ++i) {
            random_bytes[i - 1] = i;
        }

        eosio::action(
            permission_level{get_self(), "active"_n},
            request_itr->caller,
            "receiverand"_n,
            std::make_tuple(assoc_id, random_bytes)
        ).send();

        requests.erase(request_itr);
    }

}
