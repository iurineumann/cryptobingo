#pragma once

// ============================================================
// orng.wax — Dev build fiel ao contrato original WAX ORNG
//
// Ref: https://github.com/worldwide-asset-exchange/wax-orng (branch develop)
//
// Interface idêntica ao ORNG de produção:
//   requestrand(assoc_id, signing_value, caller)
//   setrand(oracle, id, ver, sig)
//   regkey(ver, exponent, modulus)
//   regoracle(oracle)
//
// Simplificações para ambiente dev (sem impacto na interface):
//   - Sem sistema de stake/créditos (qualquer chamador é aceito)
//   - Sem strike system (oracle nunca é suspenso)
//   - Oracle único (orng.wax a conta)
//   - Legacy receiverand callback ativo por padrão
//   - RSA 2048-bit (produção usa 4096-bit)
//
// Compatibilidade: bingo.game::receiverand(uint64_t, checksum256)
// ============================================================

#include <eosio/eosio.hpp>
#include <eosio/crypto.hpp>
#include <eosio/crypto_ext.hpp>
#include <eosio/singleton.hpp>
#include <vector>
#include <string>

namespace orng {
    using namespace eosio;

    // ── make_msg — idêntico ao contrato de produção ───────────────────────────
    // Ref: include/orng.hpp (branch develop)
    // Concatena: seed(32B) + dapp_value(8B LE) + nonce(8B LE) → SHA256

    static eosio::checksum256 make_msg(
        eosio::checksum256 seed, eosio::name d, uint64_t n)
    {
        auto sb = seed.extract_as_byte_array();
        std::vector<char> buf(sb.begin(), sb.end());
        uint64_t v = d.value;
        for (int i = 0; i < 8; ++i) buf.push_back((v >> (i * 8)) & 0xff);
        for (int i = 0; i < 8; ++i) buf.push_back((n >> (i * 8)) & 0xff);
        return eosio::sha256(buf.data(), buf.size());
    }

    // ── hex helper (idêntico ao orng.hpp de produção) ────────────────────────

    template<typename CharT>
    static std::string to_hex(const CharT* d, uint32_t s) {
        std::string r;
        const char* hex = "0123456789abcdef";
        uint8_t* c = (uint8_t*)d;
        for (uint32_t i = 0; i < s; ++i)
            (r += hex[(c[i] >> 4)]) += hex[(c[i] & 0x0f)];
        return r;
    }

    // ── Tabela: requisições pendentes ──────────────────────────────────────────
    // Chave: id auto-incremento (igual ao "reqs" de produção)

    struct [[eosio::table("reqs")]] request {
        uint64_t          id;
        name              dapp;      // caller
        checksum256       seed;      // sha256(to_string(signing_value))
        uint8_t           ver;       // versão da chave RSA ativa
        uint64_t          nonce;     // per-dapp incremento (simplificado: = id)
        uint64_t          assoc_id;  // correlação devolvida ao caller

        uint64_t primary_key() const { return id; }
    };
    typedef multi_index<"reqs"_n, request> reqs_table;

    // ── Tabela: chaves públicas RSA ───────────────────────────────────────────
    // Exponent e modulus como hex strings (idêntico ao "pubkeys" de produção)

    struct [[eosio::table("pubkeys")]] pubkey {
        uint8_t     ver;
        std::string exponent;  // hex (e.g., "010001")
        std::string modulus;   // hex (512 chars para 2048-bit)
        bool        retired = false;

        uint64_t primary_key() const { return (uint64_t)ver; }
    };
    typedef multi_index<"pubkeys"_n, pubkey> pkey_table;

    // ── Singleton: configuração ───────────────────────────────────────────────

    struct [[eosio::table("config.a")]] config_row {
        uint64_t active_ver = 0;   // versão da chave RSA ativa
        uint64_t req_index  = 0;   // próximo request id
    };
    typedef singleton<"config.a"_n, config_row> config_singleton;

    // ── Contrato ───────────────────────────────────────────────────────────────

    class [[eosio::contract("orng")]] orng_contract : public contract {
    public:
        using contract::contract;

        // Admin: registra chave pública RSA do daemon.
        // exponent e modulus: hex strings (e.g. "010001", "c61c...").
        [[eosio::action]]
        void regkey(uint8_t ver, std::string exponent, std::string modulus);

        // Admin: ativa uma versão de chave.
        [[eosio::action]]
        void setver(uint8_t ver);

        // Chamado por bingo.game::startdraw — registra pedido na tabela reqs.
        [[eosio::action]]
        void requestrand(uint64_t assoc_id, uint64_t signing_value, name caller);

        // Chamado pelo daemon oracle — verifica RSA e entrega resultado.
        // sig: hex string da assinatura RSA-PKCS1v15-SHA256 de make_msg().
        [[eosio::action]]
        void setrand(name oracle, uint64_t id, uint8_t ver, std::string sig);

    private:
        uint64_t _next_req_id();
    };

} // namespace orng
