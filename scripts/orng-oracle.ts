#!/usr/bin/env npx ts-node
// ============================================================
// scripts/orng-oracle.ts — Daemon oracle do WAX ORNG (dev)
//
// Fluxo (idêntico ao oracle de produção do WAX ORNG):
//   1. Poll da tabela reqs em orng.wax a cada ORNG_POLL_INTERVAL_MS
//   2. Para cada request pendente:
//      a. Reconstrói make_msg(seed, dapp, nonce) — idêntico ao contrato C++
//      b. Assina com RSA-PKCS1v15-SHA256 usando a chave privada RSA dev
//      c. Chama orng.wax::setrand(oracle, id, ver, sig_hex)
//   3. O contrato verifica, computa rnd=sha256(sig_hex) e entrega ao caller
//
// Ref: https://github.com/worldwide-asset-exchange/wax-orng (branch develop)
//      tests/rsaSigning.js — make_msg e assinatura RSA
// ============================================================

import * as fs     from 'node:fs';
import * as path   from 'node:path';
import * as crypto from 'node:crypto';

import { APIClient, FetchProvider, PrivateKey, Session, Name } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';

// ── Configuração ─────────────────────────────────────────────────────────────

const RPC_URL          = process.env.RPC_URL                   ?? 'http://127.0.0.1:8888';
const CHAIN_ID         = process.env.CHAIN_ID                  ?? '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
const ORNG_WAX_KEY     = process.env.ORNG_WAX_KEY;
const RSA_KEY_PATH     = process.env.ORNG_RSA_PRIVATE_KEY_PATH
                         ?? path.resolve(__dirname, '../contracts/orng/dev-rsa-private.pem');
const POLL_INTERVAL_MS = parseInt(process.env.ORNG_POLL_INTERVAL_MS ?? '2000', 10);
const ORACLE_ACCOUNT   = 'orng.wax';

// ── Validações iniciais ───────────────────────────────────────────────────────

if (!ORNG_WAX_KEY) {
    console.error('[ORNG Oracle] ORNG_WAX_KEY não definida. Aborting.');
    process.exit(1);
}
if (!fs.existsSync(RSA_KEY_PATH)) {
    console.error(`[ORNG Oracle] RSA private key não encontrada em: ${RSA_KEY_PATH}`);
    process.exit(1);
}

// ── PID file ──────────────────────────────────────────────────────────────────

const PID_FILE = path.resolve(__dirname, '../.orng-oracle.pid');
fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
process.on('exit',   () => { try { fs.unlinkSync(PID_FILE); } catch { /* noop */ } });
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));

// ── Clientes ─────────────────────────────────────────────────────────────────

const rpcClient = new APIClient({ provider: new FetchProvider(RPC_URL) });

const session = new Session({
    actor:        Name.from(ORACLE_ACCOUNT),
    permission:   'active',
    chain:        { id: CHAIN_ID, url: RPC_URL },
    walletPlugin: new WalletPluginPrivateKey(PrivateKey.from(ORNG_WAX_KEY)),
});

// ── RSA ───────────────────────────────────────────────────────────────────────

const rsaPrivateKeyPem = fs.readFileSync(RSA_KEY_PATH, 'utf-8');

// make_msg — idêntico ao C++ e ao rsaSigning.js do repositório oficial:
//   sha256(seed_32bytes || dapp_8bytes_LE || nonce_8bytes_LE)
//
// seed: hex string de 64 chars (checksum256 do contrato)
// dapp: nome da conta EOSIO (string)
// nonce: bigint
function makeMsgHex(seedHex: string, dapp: string, nonce: bigint): Buffer {
    const seedBuf = Buffer.from(seedHex, 'hex');               // 32 bytes

    // dapp.value: EOSIO name como uint64 LE
    const dappBuf = Buffer.alloc(8);
    dappBuf.writeBigUInt64LE(nameToUint64(dapp));

    // nonce: uint64 LE
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(nonce);

    const concat = Buffer.concat([seedBuf, dappBuf, nonceBuf]);
    return crypto.createHash('sha256').update(concat).digest();   // 32 bytes
}

// Converte nome EOSIO para uint64 (idêntico ao eosjsAccountName.nameToUint64)
function nameToUint64(name: string): bigint {
    const charToSymbol = (c: number): number => {
        if (c >= 97 && c <= 122) return c - 97 + 6;   // a-z → 6-31
        if (c >= 49 && c <= 53)  return c - 49 + 1;   // 1-5 → 1-5
        return 0;                                       // '.' → 0
    };
    let val = 0n;
    const len = Math.min(name.length, 12);
    for (let i = 0; i < len; i++) {
        val |= BigInt(charToSymbol(name.charCodeAt(i)) & 0x1f) << BigInt(64 - 5 * (i + 1));
    }
    return val;
}

// Assina o make_msg com RSA-PKCS1v15-SHA256 e retorna como hex string.
// Compatível com verify_rsa_sha256_sig do WAX CDT.
function signMessage(msgBuffer: Buffer): string {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(msgBuffer);
    return sign.sign(rsaPrivateKeyPem).toString('hex');
}

// ── Tipos da tabela reqs ──────────────────────────────────────────────────────

interface ReqRow {
    id:       string;
    dapp:     string;
    seed:     string;   // hex string (checksum256)
    ver:      number;
    nonce:    string;
    assoc_id: string;
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

const inFlight = new Set<string>();

async function fetchPendingReqs(): Promise<ReqRow[]> {
    const res = await rpcClient.v1.chain.get_table_rows({
        code:  ORACLE_ACCOUNT,
        scope: ORACLE_ACCOUNT,
        table: 'reqs',
        limit: 10,
        json:  true,
    });
    return (res.rows ?? []) as ReqRow[];
}

async function fulfillRequest(row: ReqRow): Promise<void> {
    const id    = row.id;
    const ver   = row.ver;
    const dapp  = row.dapp;
    const nonce = BigInt(row.nonce);

    // Checksum256 vem como string hex de 64 chars
    const seedHex = typeof row.seed === 'string'
        ? row.seed.replace(/^0x/, '')
        : Buffer.from(row.seed as any, 'hex').toString('hex');

    console.log(`[ORNG Oracle] → id=${id} assoc_id=${row.assoc_id} dapp=${dapp}`);

    // 1. Reconstrói make_msg
    const msgBuf = makeMsgHex(seedHex, dapp, nonce);

    // 2. Assina com RSA
    const sigHex = signMessage(msgBuf);

    // 3. Chama orng.wax::setrand
    await session.transact({
        actions: [{
            account:       ORACLE_ACCOUNT,
            name:          'setrand',
            authorization: [{ actor: ORACLE_ACCOUNT, permission: 'active' }],
            data: {
                oracle: ORACLE_ACCOUNT,
                id:     id,
                ver:    ver,
                sig:    sigHex,
            },
        }],
    }, { broadcast: true });

    console.log(`[ORNG Oracle] ✓ id=${id} fulfilled (${sigHex.length / 2} bytes RSA)`);
}

async function poll(): Promise<void> {
    let rows: ReqRow[];
    try {
        rows = await fetchPendingReqs();
    } catch {
        return; // nodeos pode estar inicializando — silencioso
    }

    for (const row of rows) {
        const key = row.id;
        if (inFlight.has(key)) continue;
        inFlight.add(key);

        fulfillRequest(row)
            .catch(err => console.error(`[ORNG Oracle] Erro id=${row.id}:`, err?.message ?? err))
            .finally(() => inFlight.delete(key));
    }
}

// ── Start ─────────────────────────────────────────────────────────────────────

console.log('');
console.log('╔════════════════════════════════════════════════╗');
console.log('║  CryptoBingo — ORNG Oracle Daemon              ║');
console.log('╚════════════════════════════════════════════════╝');
console.log(`  RPC       : ${RPC_URL}`);
console.log(`  Oracle    : ${ORACLE_ACCOUNT}`);
console.log(`  RSA key   : ${RSA_KEY_PATH}`);
console.log(`  Poll      : ${POLL_INTERVAL_MS}ms`);
console.log(`  PID       : ${process.pid}`);
console.log('');

poll();
setInterval(poll, POLL_INTERVAL_MS);
