#include <orng.hpp>

namespace orng {
    using namespace eosio;

    // ── _next_req_id ─────────────────────────────────────────────────────────

    uint64_t orng_contract::_next_req_id() {
        config_singleton cfg(get_self(), get_self().value);
        config_row c = cfg.get_or_default(config_row{});
        uint64_t id = ++c.req_index;
        cfg.set(c, get_self());
        return id;
    }

    // ── regkey ────────────────────────────────────────────────────────────────
    // Registra chave pública RSA do daemon.
    // Chamado uma vez por init_dev_env.sh após gerar o keypair.

    void orng_contract::regkey(uint8_t ver, std::string exponent, std::string modulus) {
        require_auth(get_self());
        check(!exponent.empty(), "exponent vazio.");
        check(!modulus.empty(),  "modulus vazio.");
        check(modulus.size() % 2 == 0, "modulus deve ter numero par de chars hex.");

        pkey_table pkeys(get_self(), get_self().value);
        auto it = pkeys.find((uint64_t)ver);
        if (it == pkeys.end()) {
            pkeys.emplace(get_self(), [&](auto& r) {
                r.ver       = ver;
                r.exponent  = exponent;
                r.modulus   = modulus;
                r.retired   = false;
            });
        } else {
            pkeys.modify(it, same_payer, [&](auto& r) {
                r.exponent = exponent;
                r.modulus  = modulus;
                r.retired  = false;
            });
        }
    }

    // ── setver ────────────────────────────────────────────────────────────────

    void orng_contract::setver(uint8_t ver) {
        require_auth(get_self());
        pkey_table pkeys(get_self(), get_self().value);
        check(pkeys.find((uint64_t)ver) != pkeys.end(), "versao nao encontrada. Execute regkey primeiro.");
        config_singleton cfg(get_self(), get_self().value);
        config_row c = cfg.get_or_default(config_row{});
        c.active_ver = (uint64_t)ver;
        cfg.set(c, get_self());
    }

    // ── requestrand ──────────────────────────────────────────────────────────
    // Interface idêntica ao ORNG de produção.
    // Armazena o pedido em reqs — daemon fará a entrega assincronamente.

    void orng_contract::requestrand(uint64_t assoc_id, uint64_t signing_value, name caller) {
        require_auth(caller);
        check(is_account(caller), "caller invalido.");

        config_singleton cfg(get_self(), get_self().value);
        config_row c = cfg.get_or_default(config_row{});
        check(c.active_ver > 0, "Nenhuma chave RSA ativa. Execute regkey + setver via init_dev_env.sh.");

        // Seed: sha256(to_string(signing_value)) — idêntico ao contrato de produção
        std::string sv_str = std::to_string(signing_value);
        checksum256 seed = sha256(sv_str.c_str(), sv_str.size());

        uint64_t id = _next_req_id();

        reqs_table reqs(get_self(), get_self().value);
        reqs.emplace(caller, [&](auto& r) {
            r.id       = id;
            r.dapp     = caller;
            r.seed     = seed;
            r.ver      = (uint8_t)c.active_ver;
            r.nonce    = id;     // simplificado: nonce = id (único por requisição)
            r.assoc_id = assoc_id;
        });
    }

    // ── setrand ───────────────────────────────────────────────────────────────
    // Chamado pelo daemon oracle com a assinatura RSA-PKCS1v15-SHA256.
    //
    // Fluxo (idêntico ao contrato de produção):
    //   1. Valida auth do oracle
    //   2. Localiza o request pelo id
    //   3. Reconstrói a mensagem: make_msg(seed, dapp, nonce) → 32 bytes
    //   4. Verifica assinatura RSA-SHA256 com exponent/modulus hex
    //   5. Computa rnd = sha256(sig_hex_string) — idêntico ao _validate_and_compute_rnd
    //   6. Remove request da tabela
    //   7. Entrega via legacy callback: caller::receiverand(assoc_id, rnd)

    void orng_contract::setrand(name oracle, uint64_t id, uint8_t ver, std::string sig) {
        require_auth(oracle);

        // ── 1. Localiza request ──────────────────────────────────────────────
        reqs_table reqs(get_self(), get_self().value);
        auto rit = reqs.require_find(id, "Request nao encontrado.");
        check(rit->ver == ver, "Versao da chave nao corresponde ao request.");

        // ── 2. Localiza chave publica RSA ────────────────────────────────────
        pkey_table pkeys(get_self(), get_self().value);
        auto pit = pkeys.require_find((uint64_t)ver, "Chave RSA nao encontrada.");
        check(!pit->retired, "Chave RSA expirada.");

        // ── 3. Reconstrói mensagem: make_msg(seed, dapp, nonce) ──────────────
        checksum256 msg = make_msg(rit->seed, rit->dapp, rit->nonce);
        auto msg_bytes  = msg.extract_as_byte_array();

        // ── 4. Verifica assinatura RSA-PKCS1v15-SHA256 ───────────────────────
        // verify_rsa_sha256_sig: intrínseca WAX CDT (wax-cdt/crypto_ext.hpp)
        // Todos os parâmetros de chave como hex strings (idêntico ao produção)
        bool ok = verify_rsa_sha256_sig(
            msg_bytes.data(),          // message (32 bytes)
            msg_bytes.size(),
            sig.c_str(),               // assinatura RSA hex string
            pit->exponent,             // hex string (e.g. "010001")
            pit->modulus               // hex string (512 chars para 2048-bit)
        );
        check(ok, "Assinatura RSA invalida. Verifique o daemon oracle.");

        // ── 5. Computa random value: sha256(sig_hex_string) ──────────────────
        // Idêntico ao _validate_and_compute_rnd do contrato de produção:
        //   return sha256(sig.data(), sig.size())
        checksum256 rnd = sha256(sig.data(), sig.size());

        // ── 6. Remove request (cleanup on-chain) ─────────────────────────────
        name caller    = rit->dapp;
        uint64_t assoc = rit->assoc_id;
        reqs.erase(rit);

        // ── 7. Entrega resultado via legacy callback ──────────────────────────
        // Idêntico ao _deliver_random do produção (modo legacy):
        //   ACTION receiverand(uint64_t assoc_id, const eosio::checksum256& rnd)
        action(
            permission_level{get_self(), "active"_n},
            caller,
            "receiverand"_n,
            std::make_tuple(assoc, rnd)
        ).send();
    }

} // namespace orng
