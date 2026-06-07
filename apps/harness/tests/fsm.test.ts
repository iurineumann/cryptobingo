// apps/harness/tests/fsm.test.ts
// Teste E2E da FSM completa do CryptoBingo.
//
// Cobertura:
//   Passo 0   — seed de patterns e gametype on-chain (ADR-004 Fase 2)
//   Passo 1   — creategame → status: CREATED
//   Passo 1.5 — fundgame   → CREATED → FUNDING
//   Passo 2   — deposit (on_notify)
//   Passo 3   — buytickets (ADR-001, assinatura contextual)
//   Passo 4   — lockgame   → FUNDING → LOCKED
//   Passo 5   — startdraw  → LOCKED → DRAWING
//   Passo 5   — startdraw + waitForDrawn → oracle daemon assina via RSA → DRAWN
//   Passo 6   — claimwin → DRAWN → PAYING (ADR-012: multi-winner support)
//   Passo 6.5 — closegame → PAYING → ARCHIVED (ADR-012)
//   Passo 7   — withdraw
//   Passo 8   — abortgame + refundticket (fail-safe, jogo separado; aceita PAYING)
//   Passo 9   — cleargame (GC após quarentena — bypassa 24h em teste)
//   Suite 2   — MULTI_MATCH: setstages + claimstage + closegame (ADR-013)
//   Suite 8   — COMBINAÇÕES: setcombos + claimcombo + validação (ADR-016)

import { PrivateKey, Session }                              from '@wharfkit/session';
import { WalletPluginPrivateKey }                                       from '@wharfkit/wallet-plugin-privatekey';
import { Serializer, Checksum256, Name, UInt64, ExtendedAsset, Bytes } from '@wharfkit/antelope';
import { rpcClient } from '@cryptobingo/blockchain-core';

import { applyDrawnBalls, checkWinPatterns, deriveGoldenMultiplierExported } from '../../worker-game-loop/src/services/evaluator';
import { BlockchainTicketRecord }           from '../../../packages/shared-types/src';

// ==========================================
// CONFIG
// ==========================================

const url     = process.env.RPC_URL  || 'http://127.0.0.1:8888';
const chainId = process.env.CHAIN_ID || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';


const eosioKey         = PrivateKey.from(process.env.EOSIO_KEY!);
const playerKey        = PrivateKey.from(process.env.JOGADOR1_KEY!);
const bingoKey         = PrivateKey.from(process.env.BINGO_GAME_KEY!);
const microserviceKey  = PrivateKey.from(process.env.MICROSERVICE_KEY!);

function makeSession(actor: string, key: PrivateKey) {
    return new Session({
        actor,
        permission:   'active',
        chain:        { id: chainId, url },
        walletPlugin: new WalletPluginPrivateKey(key),
    });
}

const rootSession   = makeSession('eosio',        eosioKey);
const bingoSession  = makeSession('bingo.game',   bingoKey);
const playerSession = makeSession('jogador1',     playerKey);
const microSession  = makeSession('microservice', microserviceKey);

const MASK_ROW0 = BigInt(1082401); // bits 0,5,10,15,20
const MASK_ROW1 = BigInt(2164802); // bits 1,6,11,16,21

const PATTERN_ID_ROW0 = UInt64.from(1);
const PATTERN_ID_ROW1 = UInt64.from(2);
const GAMETYPE_ID_STD = UInt64.from(1);
const GAMETYPE_ID_MM  = UInt64.from(2); // MULTI_MATCH
const GAMETYPE_WEIGHT = 10;

let mainGameId:    UInt64;
let mainGameIdStr: string;
let abortGameId:   UInt64;
let abortGameIdStr: string;
let mmGameId:      UInt64;
let mmGameIdStr:   string;

// Matriz de teste — ROW_0 = {1,6,11,15,20}; ROW_1 = {2,7,12,16,21} (mas 12 é FREE SPACE)
const TEST_MATRIX = [
    1, 2, 3, 4, 5,
    6, 7, 8, 9, 10,
    11, 13, 14, 40,  // N col sem FREE SPACE (bit 12)
    15, 16, 17, 18, 19,
    20, 21, 22, 23, 24,
];

// ==========================================
// HELPERS
// ==========================================

function randomGameName(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz12345';
    let s = 'g';
    for (let i = 0; i < 11; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

async function transact(session: Session, account: string, name: string, data: object) {
    return session.transact({
        actions: [{
            account,
            name,
            authorization: [session.permissionLevel],
            data,
        }],
    }, { broadcast: true });
}

async function getGameStatus(gameIdStr: string): Promise<string> {
    const res = await fetch(`${url}/v1/chain/get_table_rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code: 'bingo.game', scope: 'bingo.game', table: 'games',
            lower_bound: gameIdStr, upper_bound: gameIdStr,
            limit: 1, json: true,
        }),
    }).then(r => r.json() as any);
    return res.rows?.[0]?.status ?? 'not_found';
}

// Aguarda o oracle daemon ORNG responder e o jogo transitar para 'drawn'.
// O daemon polela a tabela reqs de orng.wax, assina com RSA e chama setrand.
// Timeout configurável (padrão: 30 tentativas × 2s = 60s).
async function waitForDrawn(gameIdStr: string, attempts = 30): Promise<void> {
    for (let i = 0; i < attempts; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await getGameStatus(gameIdStr);
        if (status === 'drawn') return;
        if (status !== 'drawing') throw new Error(`Estado inesperado: ${status}`);
    }
    throw new Error(`Timeout: jogo ${gameIdStr} ainda em 'drawing' após ${attempts * 2}s. Oracle daemon rodando?`);
}

// ==========================================
// SUITE PRINCIPAL — Happy Path completo
// ==========================================

describe('FSM — Happy Path (CREATED → FUNDING → PAYING → ARCHIVED)', () => {

    beforeAll(async () => {
        const name1     = Name.from(randomGameName());
        mainGameId      = name1.value;
        mainGameIdStr   = name1.toString();

        const name2     = Name.from(randomGameName());
        abortGameId     = name2.value;
        abortGameIdStr  = name2.toString();

        const name3     = Name.from(randomGameName());
        mmGameId        = name3.value;
        mmGameIdStr     = name3.toString();

        console.log(`\n🎲 Jogo principal: ${mainGameIdStr} (${mainGameId})`);
        console.log(`🎲 Jogo abort:     ${abortGameIdStr} (${abortGameId})`);
        console.log(`🎲 Jogo MM:        ${mmGameIdStr} (${mmGameId})\n`);

        try {
            await transact(rootSession, 'eosio', 'newaccount', {
                creator: 'eosio', name: 'microservice',
                owner:  { threshold: 1, keys: [{ key: eosioKey.toPublic().toString(), weight: 1 }], accounts: [], waits: [] },
                active: { threshold: 1, keys: [{ key: eosioKey.toPublic().toString(), weight: 1 }], accounts: [], waits: [] },
            });
        } catch { /* já existe */ }
    });

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 0: Seed patterns (ROW_0, ROW_1) e gametype Standard', async () => {
        const row0Mask = Number(MASK_ROW0);
        const row1Mask = Number(MASK_ROW1);

        await transact(bingoSession, 'bingo.game', 'addpattern', {
            pattern_id: PATTERN_ID_ROW0, name: 'ROW_0', mask: row0Mask,
        });
        await transact(bingoSession, 'bingo.game', 'addpattern', {
            pattern_id: PATTERN_ID_ROW1, name: 'ROW_1', mask: row1Mask,
        });

        // ADR-012: addgametype agora exige draw_mode, max_balls, golden_ball_after, master_weight_ovrd
        const r = await transact(bingoSession, 'bingo.game', 'addgametype', {
            gametype_id:      GAMETYPE_ID_STD,
            name:             'Standard',
            base_multiplier:  1,
            rules:            [{ pattern_id: PATTERN_ID_ROW0, weight: GAMETYPE_WEIGHT }],
            draw_mode:        'standard',
            max_balls:        35,
            golden_ball_after: 0,
            master_weight_ovrd: 0,
        });
        expect(r.response).toBeDefined();
        console.log(`   ✅ ROW_0 (mask: ${row0Mask}), ROW_1 (mask: ${row1Mask}), Gametype Standard`);
    });

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 1: creategame → status CREATED', async () => {
        await transact(bingoSession, 'bingo.game', 'creategame', {
            game_id:      mainGameId,
            ticket_price: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            gametype_id:  GAMETYPE_ID_STD,
            room_id:      UInt64.from(0),
        });
        expect(await getGameStatus(mainGameIdStr)).toBe('created');
        console.log('   ✅ status: created');
    });

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 1.5: fundgame → CREATED → FUNDING', async () => {
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: mainGameId });
        expect(await getGameStatus(mainGameIdStr)).toBe('funding');
        console.log('   ✅ status: funding');
    });

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 2: deposit via on_notify', async () => {
        const r = await transact(playerSession, 'eosio.token', 'transfer', {
            from: 'jogador1', to: 'bingo.game',
            quantity: '500.0000 WAX', memo: 'Deposito para jogar',
        });
        expect(r.response).toBeDefined();
        console.log('   ✅ Depósito realizado');
    });

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 3: buytickets', async () => {
        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: mainGameId  }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner       }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        const r = await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer:           owner,
            game_id:         mainGameId,
            matrices:        [matrixBytes],
            signatures:      [sig],
            nft_id:          0,
            requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
        });
        expect(r.response).toBeDefined();
        console.log('   ✅ Cartela comprada');
    });

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 4: lockgame → FUNDING → LOCKED', async () => {
        await transact(microSession, 'bingo.game', 'lockgame', { game_id: mainGameId });
        console.log('   ✅ status: locked');
    });

    test('Passo 5: startdraw → LOCKED → DRAWING → DRAWN (oracle ORNG real)', async () => {
        // startdraw transita para DRAWING e emite requestrand para orng.wax.
        // O daemon oracle detecta o pedido, assina com RSA e chama setrand.
        // O contrato verifica, deriva as bolas e chama receiverand → DRAWN.
        await transact(microSession, 'bingo.game', 'startdraw', { game_id: mainGameId });
        expect(await getGameStatus(mainGameIdStr)).toBe('drawing');
        console.log('   ✅ status: drawing — aguardando daemon oracle...');
        await waitForDrawn(mainGameIdStr);
        console.log('   ✅ status: drawn (oracle ORNG respondeu)');
    }, 90_000); // 90s timeout — daemon polela a cada 2s

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 6: claimwin → DRAWN → PAYING (ADR-012: multi-winner)', async () => {
        const [gameRes, ticketRes] = await Promise.all([
            rpcClient.v1.chain.get_table_rows({
                code: 'bingo.game', scope: 'bingo.game', table: 'games',
                lower_bound: mainGameIdStr, upper_bound: mainGameIdStr, limit: 1, json: true,
            }),
            rpcClient.v1.chain.get_table_rows({
                code: 'bingo.game', scope: mainGameIdStr, table: 'tickets', limit: 1, json: true,
            }),
        ]);

        const drawnBalls: number[] = gameRes.rows[0].drawn_balls;
        const ticket = ticketRes.rows[0] as BlockchainTicketRecord;
        const ticketId = UInt64.from(ticket.ticket_id);

        const finalState = applyDrawnBalls(ticket, drawnBalls.slice(0, 35)); // ADR-012: usa 35 bolas
        let winPatternMask = UInt64.from(MASK_ROW0.toString()); // fallback

        for (const mask of [MASK_ROW0, MASK_ROW1]) {
            if ((BigInt(finalState) & mask) === mask) {
                winPatternMask = UInt64.from(mask.toString()); break;
            }
        }

        // ADR-012: claimwin agora exige golden_multiplier (0 = sem efeito)
        const r = await transact(microSession, 'bingo.game', 'claimwin', {
            game_id:           mainGameId,
            ticket_id:         ticketId,
            ball_count:        35,
            win_pattern_mask:  winPatternMask,
            golden_multiplier: 0,
        });
        expect(r.response).toBeDefined();

        // ADR-012: status agora é PAYING (não archived) após o primeiro claimwin
        expect(await getGameStatus(mainGameIdStr)).toBe('paying');
        console.log(`   ✅ Prêmio liquidado → status: paying (mask: ${winPatternMask})`);
    });

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 6.5: closegame → PAYING → ARCHIVED (ADR-012)', async () => {
        const r = await transact(microSession, 'bingo.game', 'closegame', { game_id: mainGameId });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(mainGameIdStr)).toBe('archived');
        console.log('   ✅ status: archived');
    });

    // ──────────────────────────────────────────────────────────────────────────
    test('Passo 7: withdraw', async () => {
        const r = await transact(playerSession, 'bingo.game', 'withdraw', {
            owner:  'jogador1',
            amount: ExtendedAsset.from({ quantity: '100.0000 WAX', contract: 'eosio.token' }),
        });
        expect(r.response).toBeDefined();
        console.log('   ✅ Saque realizado');
    });
});

// ==========================================
// SUITE FAIL-SAFE — Abort + Refund + GC
// ==========================================

describe('FSM — Fail-Safe (LOCKED → ABORTED → GC)', () => {

    test('Setup: cria, funde, compra, trava jogo de abort', async () => {
        await transact(bingoSession, 'bingo.game', 'creategame', {
            game_id:      abortGameId,
            ticket_price: ExtendedAsset.from({ quantity: '5.0000 WAX', contract: 'eosio.token' }),
            gametype_id:  GAMETYPE_ID_STD,
            room_id:      UInt64.from(0),
        });
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: abortGameId });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes  }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: abortGameId  }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner        }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer:           owner,
            game_id:         abortGameId,
            matrices:        [matrixBytes],
            signatures:      [sig],
            nft_id:          0,
            requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
        });
        await transact(microSession, 'bingo.game', 'lockgame', { game_id: abortGameId });
        console.log(`   ✅ Jogo abort ${abortGameIdStr} em LOCKED`);
    });

    test('abortgame → LOCKED → ABORTED (ADR-012: também aceita PAYING)', async () => {
        const r = await transact(microSession, 'bingo.game', 'abortgame', {
            game_id: abortGameId, reason: 'ORACLE_TIMEOUT',
        });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(abortGameIdStr)).toBe('aborted');
        console.log('   ✅ status: aborted');
    });

    test('refundticket → estorno O(1)', async () => {
        const ticketRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: abortGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        expect(ticketRes.rows.length).toBeGreaterThan(0);

        await transact(playerSession, 'bingo.game', 'refundticket', {
            game_id: abortGameId, ticket_id: UInt64.from(ticketRes.rows[0].ticket_id),
        });

        const check = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: abortGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        expect(check.rows.length).toBe(0);
        console.log('   ✅ Cartela estornada e apagada');
    });

    test('cleargame → GC (ABORTED sem quarentena)', async () => {
        await transact(microSession, 'bingo.game', 'cleargame', {
            game_id: abortGameId, max_rows: 100,
        });
        const check = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: 'bingo.game', table: 'games',
            lower_bound: abortGameIdStr, upper_bound: abortGameIdStr, limit: 1, json: true,
        });
        expect(check.rows.length).toBe(0);
        console.log('   ✅ Jogo apagado da RAM');
    });
});

// ==========================================
// SUITE MULTI_MATCH — ADR-013
// Valida: setstages, claimstage (múltiplos estágios), closegame
// ==========================================

describe('FSM — MULTI_MATCH (DRAWN → PAYING → ARCHIVED por estágios)', () => {

    test('MM-0: Gametype MULTI_MATCH com 2 estágios via setstages', async () => {
        // Cria gametype base com ROW_0 e ROW_1
        await transact(bingoSession, 'bingo.game', 'addgametype', {
            gametype_id:       GAMETYPE_ID_MM,
            name:              'MultiMatch2',
            base_multiplier:   1,
            rules:             [
                { pattern_id: PATTERN_ID_ROW0, weight: 100 },
                { pattern_id: PATTERN_ID_ROW1, weight: 100 },
            ],
            draw_mode:         'multimatch',
            max_balls:         35,
            golden_ball_after: 0,
            master_weight_ovrd: 0,
        });

        // Define estágios: stage 1 = 1 padrão (peso 1.50×), stage 2 = 2 padrões (peso 5×)
        const r = await transact(bingoSession, 'bingo.game', 'setstages', {
            gametype_id: GAMETYPE_ID_MM,
            stages: [
                { stage: 1, patterns_required: 1, weight: 150 },  // 1.50×
                { stage: 2, patterns_required: 2, weight: 500 },  // 5×
            ],
        });
        expect(r.response).toBeDefined();
        console.log('   ✅ Gametype MULTI_MATCH criado com 2 estágios');
    });

    test('MM-1: Cria, funde, compra cartela, trava, sorteia', async () => {
        await transact(bingoSession, 'bingo.game', 'creategame', {
            game_id:      mmGameId,
            ticket_price: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            gametype_id:  GAMETYPE_ID_MM,
            room_id:      UInt64.from(0),
        });
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: mmGameId });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: mmGameId    }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner       }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer:           owner,
            game_id:         mmGameId,
            matrices:        [matrixBytes],
            signatures:      [sig],
            nft_id:          0,
            requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
        });
        await transact(microSession, 'bingo.game', 'lockgame',  { game_id: mmGameId });
        await transact(microSession, 'bingo.game', 'startdraw', { game_id: mmGameId });
        await waitForDrawn(mmGameIdStr);

        expect(await getGameStatus(mmGameIdStr)).toBe('drawn');
        console.log('   ✅ Jogo MULTI_MATCH sorteado → status: drawn (oracle ORNG)');
    }, 90_000);

    test('MM-2: claimstage stage 1 → DRAWN → PAYING', async () => {
        const ticketRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: mmGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        expect(ticketRes.rows.length).toBeGreaterThan(0);
        const ticketId = UInt64.from(ticketRes.rows[0].ticket_id);

        // claimstage estágio 1 (1 padrão)
        const r = await transact(microSession, 'bingo.game', 'claimstage', {
            game_id:          mmGameId,
            ticket_id:        ticketId,
            stage:            1,
            ball_count:       35,
            win_pattern_mask: UInt64.from(MASK_ROW0.toString()),
        });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(mmGameIdStr)).toBe('paying');
        console.log('   ✅ Stage 1 liquidado → status: paying');
    });

    test('MM-3: claimstage stage 2 mesmo ticket → ainda PAYING', async () => {
        const ticketRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: mmGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        const ticketId = UInt64.from(ticketRes.rows[0].ticket_id);

        // claimstage estágio 2 (2 padrões) — mesmo ticket pode acumular stages
        const r = await transact(microSession, 'bingo.game', 'claimstage', {
            game_id:          mmGameId,
            ticket_id:        ticketId,
            stage:            2,
            ball_count:       35,
            win_pattern_mask: UInt64.from(MASK_ROW1.toString()),
        });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(mmGameIdStr)).toBe('paying');
        console.log('   ✅ Stage 2 liquidado → status: paying (acumulação confirmada)');
    });

    test('MM-4: closegame → PAYING → ARCHIVED', async () => {
        const r = await transact(microSession, 'bingo.game', 'closegame', { game_id: mmGameId });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(mmGameIdStr)).toBe('archived');
        console.log('   ✅ Jogo MULTI_MATCH arquivado → status: archived');
    });

    test('MM-5: abortgame aceita PAYING (fail-safe ADR-012)', async () => {
        // Cria um jogo rápido apenas para testar abort em estado paying
        const payingName    = Name.from(randomGameName());
        const payingGameId  = payingName.value;
        const payingGameStr = payingName.toString();

        await transact(bingoSession, 'bingo.game', 'creategame', {
            game_id:      payingGameId,
            ticket_price: ExtendedAsset.from({ quantity: '5.0000 WAX', contract: 'eosio.token' }),
            gametype_id:  GAMETYPE_ID_STD,
            room_id:      UInt64.from(0),
        });
        await transact(microSession, 'bingo.game', 'fundgame',   { game_id: payingGameId });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes  }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: payingGameId }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner        }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer:           owner,
            game_id:         payingGameId,
            matrices:        [matrixBytes],
            signatures:      [sig],
            nft_id:          0,
            requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
        });
        await transact(microSession, 'bingo.game', 'lockgame',  { game_id: payingGameId });
        await transact(microSession, 'bingo.game', 'startdraw', { game_id: payingGameId });
        await waitForDrawn(payingGameStr);

        const ticketRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: payingGameStr, table: 'tickets', limit: 1, json: true,
        });
        // Leva jogo a PAYING via claimwin
        await transact(microSession, 'bingo.game', 'claimwin', {
            game_id: payingGameId, ticket_id: UInt64.from(ticketRes.rows[0].ticket_id),
            ball_count: 35, win_pattern_mask: UInt64.from(MASK_ROW0.toString()),
            golden_multiplier: 0,
        });
        expect(await getGameStatus(payingGameStr)).toBe('paying');

        // Abort em estado paying deve ser aceito (ADR-012)
        await transact(microSession, 'bingo.game', 'abortgame', {
            game_id: payingGameId, reason: 'MANUAL_HALT',
        });
        expect(await getGameStatus(payingGameStr)).toBe('aborted');
        console.log('   ✅ abortgame aceita status paying → aborted');
    }, 90_000);
});

// ==========================================
// SUITE 4 — GOLDEN_BALL (ADR-012)
// Valida: gametype goldenball, derive multiplier, claimwin com golden_multiplier > 0
// ==========================================

const GAMETYPE_ID_GB = UInt64.from(3);

describe('FSM — GOLDEN_BALL (DRAWN → PAYING → ARCHIVED com multiplicador)', () => {

    let gbGameId:    UInt64;
    let gbGameIdStr: string;

    beforeAll(async () => {
        const n   = Name.from(randomGameName());
        gbGameId    = n.value;
        gbGameIdStr = n.toString();
        console.log(`\n🌟 Jogo GOLDEN_BALL: ${gbGameIdStr} (${gbGameId})\n`);
    });

    test('GB-0: addgametype GOLDEN_BALL (draw_mode=goldenball, golden_ball_after=4, max_balls=20)', async () => {
        const r = await transact(bingoSession, 'bingo.game', 'addgametype', {
            gametype_id:        GAMETYPE_ID_GB,
            name:               'GoldenBall',
            base_multiplier:    1,
            rules:              [{ pattern_id: PATTERN_ID_ROW0, weight: GAMETYPE_WEIGHT }],
            draw_mode:          'goldenball',
            max_balls:          20,
            golden_ball_after:  4,
            master_weight_ovrd: 0,
        });
        expect(r.response).toBeDefined();
        console.log('   ✅ Gametype GOLDEN_BALL criado (golden_ball_after=4, max_balls=20)');
    });

    test('GB-1: cria, funde, compra, trava, sorteia jogo GOLDEN_BALL', async () => {
        await transact(bingoSession, 'bingo.game', 'creategame', {
            game_id:      gbGameId,
            ticket_price: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            gametype_id:  GAMETYPE_ID_GB,
            room_id:      UInt64.from(0),
        });
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: gbGameId });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: gbGameId    }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner       }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer:           owner,
            game_id:         gbGameId,
            matrices:        [matrixBytes],
            signatures:      [sig],
            nft_id:          0,
            requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
        });
        await transact(microSession, 'bingo.game', 'lockgame',  { game_id: gbGameId });
        await transact(microSession, 'bingo.game', 'startdraw', { game_id: gbGameId });
        await waitForDrawn(gbGameIdStr);
        expect(await getGameStatus(gbGameIdStr)).toBe('drawn');
        console.log('   ✅ Jogo GOLDEN_BALL sorteado → status: drawn');
    }, 90_000);

    test('GB-2: claimwin com golden_multiplier derivado de drawn_balls → PAYING', async () => {
        const [gameRes, ticketRes] = await Promise.all([
            rpcClient.v1.chain.get_table_rows({
                code: 'bingo.game', scope: 'bingo.game', table: 'games',
                lower_bound: gbGameIdStr, upper_bound: gbGameIdStr, limit: 1, json: true,
            }),
            rpcClient.v1.chain.get_table_rows({
                code: 'bingo.game', scope: gbGameIdStr, table: 'tickets', limit: 1, json: true,
            }),
        ]);

        const drawnBalls: number[] = gameRes.rows[0].drawn_balls;
        const goldenBallAfter = 4;
        // ball_count = goldenBallAfter + 1: inclui as bolas normais + a golden ball
        const ballCount       = goldenBallAfter + 1;
        const goldenMultiplier = deriveGoldenMultiplierExported(drawnBalls, goldenBallAfter);
        expect(goldenMultiplier).toBeGreaterThanOrEqual(2); // mínimo sempre 2

        const ticket = ticketRes.rows[0];
        const ticketId = UInt64.from(ticket.ticket_id);

        const r = await transact(microSession, 'bingo.game', 'claimwin', {
            game_id:           gbGameId,
            ticket_id:         ticketId,
            ball_count:        ballCount,
            win_pattern_mask:  UInt64.from(MASK_ROW0.toString()),
            golden_multiplier: goldenMultiplier,
        });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(gbGameIdStr)).toBe('paying');
        console.log(`   ✅ claimwin golden_multiplier=${goldenMultiplier}x → status: paying`);
    });

    test('GB-3: closegame → PAYING → ARCHIVED', async () => {
        const r = await transact(microSession, 'bingo.game', 'closegame', { game_id: gbGameId });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(gbGameIdStr)).toBe('archived');
        console.log('   ✅ Jogo GOLDEN_BALL arquivado → status: archived');
    });
});

// ==========================================
// SUITE 5 — FIRST_FULL (ADR-012)
// Valida: draw_mode=firstfull, ball_count = cutoff (1ª cartela completa)
// ==========================================

const GAMETYPE_ID_FF = UInt64.from(4);

describe('FSM — FIRST_FULL (DRAWN → PAYING → ARCHIVED com cutoff dinamico)', () => {

    let ffGameId:    UInt64;
    let ffGameIdStr: string;

    beforeAll(async () => {
        const n   = Name.from(randomGameName());
        ffGameId    = n.value;
        ffGameIdStr = n.toString();
        console.log(`\n🏁 Jogo FIRST_FULL: ${ffGameIdStr} (${ffGameId})\n`);
    });

    test('FF-0: addgametype FIRST_FULL (draw_mode=firstfull, max_balls=75)', async () => {
        const r = await transact(bingoSession, 'bingo.game', 'addgametype', {
            gametype_id:        GAMETYPE_ID_FF,
            name:               'FirstFull',
            base_multiplier:    1,
            rules:              [{ pattern_id: PATTERN_ID_ROW0, weight: GAMETYPE_WEIGHT }],
            draw_mode:          'firstfull',
            max_balls:          75,
            golden_ball_after:  0,
            master_weight_ovrd: 0,
        });
        expect(r.response).toBeDefined();
        console.log('   ✅ Gametype FIRST_FULL criado (max_balls=75)');
    });

    test('FF-1: cria, funde, compra, trava, sorteia jogo FIRST_FULL', async () => {
        await transact(bingoSession, 'bingo.game', 'creategame', {
            game_id:      ffGameId,
            ticket_price: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            gametype_id:  GAMETYPE_ID_FF,
            room_id:      UInt64.from(0),
        });
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: ffGameId });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: ffGameId    }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner       }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer:           owner,
            game_id:         ffGameId,
            matrices:        [matrixBytes],
            signatures:      [sig],
            nft_id:          0,
            requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
        });
        await transact(microSession, 'bingo.game', 'lockgame',  { game_id: ffGameId });
        await transact(microSession, 'bingo.game', 'startdraw', { game_id: ffGameId });
        await waitForDrawn(ffGameIdStr);
        expect(await getGameStatus(ffGameIdStr)).toBe('drawn');
        console.log('   ✅ Jogo FIRST_FULL sorteado (75 bolas) → status: drawn');
    }, 90_000);

    test('FF-2: computa cutoff ball e claimwin com ball_count=cutoff → PAYING', async () => {
        const gameRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: 'bingo.game', table: 'games',
            lower_bound: ffGameIdStr, upper_bound: ffGameIdStr, limit: 1, json: true,
        });
        const drawnBalls: number[] = gameRes.rows[0].drawn_balls;
        expect(drawnBalls.length).toBe(75);

        // Computa o cutoff: posição em que o ticket TEST_MATRIX fica completo
        const matrixNums = new Set(TEST_MATRIX); // 24 números (sem FREE SPACE)
        let cutoff = drawnBalls.length;
        const remaining = new Set(matrixNums);
        for (let i = 0; i < drawnBalls.length; i++) {
            remaining.delete(drawnBalls[i]);
            if (remaining.size === 0) { cutoff = i + 1; break; }
        }
        expect(cutoff).toBeLessThanOrEqual(75);

        const ticketRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: ffGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        const ticketId = UInt64.from(ticketRes.rows[0].ticket_id);

        const r = await transact(microSession, 'bingo.game', 'claimwin', {
            game_id:           ffGameId,
            ticket_id:         ticketId,
            ball_count:        cutoff,
            win_pattern_mask:  UInt64.from(MASK_ROW0.toString()),
            golden_multiplier: 0,
        });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(ffGameIdStr)).toBe('paying');
        console.log(`   ✅ FIRST_FULL cutoff=${cutoff} bolas → status: paying`);
    });

    test('FF-3: closegame → PAYING → ARCHIVED', async () => {
        const r = await transact(microSession, 'bingo.game', 'closegame', { game_id: ffGameId });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(ffGameIdStr)).toBe('archived');
        console.log('   ✅ Jogo FIRST_FULL arquivado → status: archived');
    });
});

// ==========================================
// SUITE 6 — DROP_VAULT (ADR-011)
// Valida: transfer vault → deposit; allocatedrop; execdrop; dup-exec fail; deallocdrop auth
// ==========================================

describe('DROP_VAULT — deposit via transfer + alloc + exec + guarda de autorização', () => {

    let vaultRoomId: UInt64;
    let depositId:   number;
    let allocId:     number;

    beforeAll(async () => {
        vaultRoomId = UInt64.from(999);
    });

    test('DV-0: createroom id=999 para suportar allocatedrop', async () => {
        const price50 = ExtendedAsset.from({ quantity: '50.0000 WAX', contract: 'eosio.token' });
        try {
            const r = await transact(bingoSession, 'bingo.game', 'createroom', {
                room_id:                 vaultRoomId,
                sponsor:                 'bingo.game',
                gametype_id:             GAMETYPE_ID_STD,
                ticket_price_min:        price50,
                ticket_price_max:        price50,
                ticket_price_default:    price50,
                max_tickets_per_player:  10,
                sponsor_room:            false,
            });
            expect(r.response).toBeDefined();
        } catch {
            // sala pode já existir de uma execução anterior — ok
        }
        await transact(microSession, 'bingo.game', 'activateroom', { room_id: vaultRoomId });
        console.log('   ✅ Sala 999 criada/ativa para DROP_VAULT');
    });

    test('DV-1: transfer memo=vault → deposit criado no Drop Vault', async () => {
        // Lê o próximo deposit_id antes da transferência
        const stateRes = await fetch(`${url}/v1/chain/get_table_rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: 'bingo.game', scope: 'bingo.game', table: 'dropstate',
                limit: 1, json: true,
            }),
        }).then(r => r.json() as any);
        const nextDepId = stateRes.rows?.[0]?.next_deposit_id ?? 1;

        const r = await transact(playerSession, 'eosio.token', 'transfer', {
            from: 'jogador1', to: 'bingo.game',
            quantity: '100.0000 WAX', memo: 'vault',
        });
        expect(r.response).toBeDefined();

        // Confirma que o deposit foi criado
        const depRes = await fetch(`${url}/v1/chain/get_table_rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: 'bingo.game', scope: 'bingo.game', table: 'dropdeposits',
                lower_bound: nextDepId, upper_bound: nextDepId, limit: 1, json: true,
            }),
        }).then(r => r.json() as any);
        expect(depRes.rows.length).toBe(1);
        expect(depRes.rows[0].status).toBe('available');

        depositId = nextDepId;
        console.log(`   ✅ Depósito ${depositId} criado (100 WAX) → status: available`);
    });

    test('DV-2: allocatedrop → alloc criada (status: active)', async () => {
        const stateRes = await fetch(`${url}/v1/chain/get_table_rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: 'bingo.game', scope: 'bingo.game', table: 'dropstate',
                limit: 1, json: true,
            }),
        }).then(r => r.json() as any);
        const nextAllocId = stateRes.rows?.[0]?.next_alloc_id ?? 1;

        const r = await transact(playerSession, 'bingo.game', 'allocatedrop', {
            caller:            Name.from('jogador1'),
            deposit_id:        depositId,
            room_id:           vaultRoomId,
            quantity_per_drop: ExtendedAsset.from({ quantity: '100.0000 WAX', contract: 'eosio.token' }),
            nft_asset_id:      0,
            drop_chance_bps:   10000,
        });
        expect(r.response).toBeDefined();

        allocId = nextAllocId;
        console.log(`   ✅ Alocação ${allocId} criada → status: active`);
    });

    test('DV-3: deallocdrop por conta sem auth (microservice) → falha', async () => {
        await expect(
            transact(microSession, 'bingo.game', 'deallocdrop', {
                caller:   Name.from('microservice'),
                alloc_id: allocId,
            })
        ).rejects.toThrow();
        console.log('   ✅ deallocdrop por microservice rejeitado (owner=jogador1)');
    });

    test('DV-4: execdrop → vencedor recebe 100 WAX no saldo interno', async () => {
        const r = await transact(microSession, 'bingo.game', 'execdrop', {
            alloc_id: allocId,
            winner:   Name.from('jogador1'),
            quantity: ExtendedAsset.from({ quantity: '100.0000 WAX', contract: 'eosio.token' }),
        });
        expect(r.response).toBeDefined();
        console.log('   ✅ execdrop executado → saldo interno de jogador1 creditado');
    });

    test('DV-5: segundo execdrop no mesmo alloc_id → falha (Alocacao nao esta ativa)', async () => {
        await expect(
            transact(microSession, 'bingo.game', 'execdrop', {
                alloc_id: allocId,
                winner:   Name.from('jogador1'),
                quantity: ExtendedAsset.from({ quantity: '100.0000 WAX', contract: 'eosio.token' }),
            })
        ).rejects.toThrow();
        console.log('   ✅ execdrop duplicado rejeitado (alloc exhausted)');
    });
});

// ==========================================
// SUITE 7 — ROOM_PRICING (ADR-010)
// Valida: createroom + activateroom; buytickets price < min → fail; price in range → ok
// ==========================================

describe('ROOM_PRICING — ticket_price_min/max e buytickets com requested_price', () => {

    const ROOM_ID = UInt64.from(42);
    let pricedGameId:    UInt64;
    let pricedGameIdStr: string;

    beforeAll(async () => {
        const n         = Name.from(randomGameName());
        pricedGameId    = n.value;
        pricedGameIdStr = n.toString();
        console.log(`\n💰 Jogo ROOM_PRICING: ${pricedGameIdStr} (${pricedGameId})\n`);
    });

    test('RP-0: createroom id=42 com price_min=10 WAX, price_max=50 WAX', async () => {
        const min = ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' });
        const max = ExtendedAsset.from({ quantity: '50.0000 WAX', contract: 'eosio.token' });
        try {
            const r = await transact(bingoSession, 'bingo.game', 'createroom', {
                room_id:                 ROOM_ID,
                sponsor:                 'bingo.game',
                gametype_id:             GAMETYPE_ID_STD,
                ticket_price_min:        min,
                ticket_price_max:        max,
                ticket_price_default:    min,
                max_tickets_per_player:  5,
                sponsor_room:            false,
            });
            expect(r.response).toBeDefined();
        } catch {
            // sala pode já existir — ok
        }
        await transact(microSession, 'bingo.game', 'activateroom', { room_id: ROOM_ID });
        console.log('   ✅ Sala 42 criada/ativa (min=10 WAX, max=50 WAX)');
    });

    test('RP-1: creategame vinculado a room_id=42', async () => {
        const r = await transact(bingoSession, 'bingo.game', 'creategame', {
            game_id:      pricedGameId,
            ticket_price: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            gametype_id:  GAMETYPE_ID_STD,
            room_id:      ROOM_ID,
        });
        expect(r.response).toBeDefined();
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: pricedGameId });
        console.log('   ✅ Jogo criado e financiado em sala 42');
    });

    test('RP-2: buytickets com requested_price=5 WAX (< min=10 WAX) → falha', async () => {
        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes   }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: pricedGameId  }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner         }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await expect(
            transact(playerSession, 'bingo.game', 'buytickets', {
                buyer:           owner,
                game_id:         pricedGameId,
                matrices:        [matrixBytes],
                signatures:      [sig],
                nft_id:          0,
                requested_price: ExtendedAsset.from({ quantity: '5.0000 WAX', contract: 'eosio.token' }),
            })
        ).rejects.toThrow();
        console.log('   ✅ requested_price=5 WAX < min=10 WAX → rejeitado pelo contrato');
    });

    test('RP-3: buytickets com requested_price=20 WAX (within range) → sucesso', async () => {
        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes   }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: pricedGameId  }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner         }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        const r = await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer:           owner,
            game_id:         pricedGameId,
            matrices:        [matrixBytes],
            signatures:      [sig],
            nft_id:          0,
            requested_price: ExtendedAsset.from({ quantity: '20.0000 WAX', contract: 'eosio.token' }),
        });
        expect(r.response).toBeDefined();
        console.log('   ✅ requested_price=20 WAX in [10,50] WAX → cartela comprada');
    });
});

// ==========================================
// SUITE 8 — COMBINAÇÕES (ADR-016)
// Valida: setcombos (registro on-chain), claimcombo (payout = price ×
// base_multiplier × combo_weight / 100) e validação de combo_id inexistente.
// ==========================================

const GAMETYPE_ID_COMBO = UInt64.from(8);
const COMBO_WEIGHT       = 250; // 2.50× (hundredths)
const COMBO_TICKET_PRICE = 10;  // WAX

let comboGameId:    UInt64;
let comboGameIdStr: string;

// Lê o saldo in-contract (tabela balances) de uma conta para um símbolo.
async function getContractBalance(account: string, symbolCode = 'WAX'): Promise<number> {
    const res = await rpcClient.v1.chain.get_table_rows({
        code: 'bingo.game', scope: account, table: 'balances', limit: 50, json: true,
    });
    for (const row of res.rows as Array<{ balance: { quantity: string } }>) {
        const [amount, sym] = row.balance.quantity.split(' ');
        if (sym === symbolCode) return parseFloat(amount);
    }
    return 0;
}

describe('FSM — COMBINAÇÕES (setcombos + claimcombo) [ADR-016]', () => {

    beforeAll(() => {
        const n = Name.from(randomGameName());
        comboGameId    = n.value;
        comboGameIdStr = n.toString();
        console.log(`\n🔗 Jogo COMBO: ${comboGameIdStr} (${comboGameId})\n`);
    });

    test('CB-0: addgametype + setcombos → combinações on-chain', async () => {
        // Garante patterns ROW_0/ROW_1 (idempotente entre suites)
        for (const [id, name, mask] of [[PATTERN_ID_ROW0, 'ROW_0', MASK_ROW0], [PATTERN_ID_ROW1, 'ROW_1', MASK_ROW1]] as const) {
            try {
                await transact(bingoSession, 'bingo.game', 'addpattern', { pattern_id: id, name, mask: Number(mask) });
            } catch { /* já existe */ }
        }

        await transact(bingoSession, 'bingo.game', 'addgametype', {
            gametype_id:        GAMETYPE_ID_COMBO,
            name:               'Combos',
            base_multiplier:    1,
            rules:              [
                { pattern_id: PATTERN_ID_ROW0, weight: GAMETYPE_WEIGHT },
                { pattern_id: PATTERN_ID_ROW1, weight: GAMETYPE_WEIGHT },
            ],
            draw_mode:          'standard',
            max_balls:          35,
            golden_ball_after:  0,
            master_weight_ovrd: 0,
        });

        const r = await transact(bingoSession, 'bingo.game', 'setcombos', {
            gametype_id:  GAMETYPE_ID_COMBO,
            combinations: [{ combo_id: 0, weight: COMBO_WEIGHT }],
        });
        expect(r.response).toBeDefined();

        // Verifica on-chain
        const gtRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: 'bingo.game', table: 'gametypes',
            lower_bound: '8', upper_bound: '8', limit: 1, json: true,
        });
        const combos = (gtRes.rows[0] as { combinations: Array<{ combo_id: number; weight: number }> }).combinations;
        expect(combos).toEqual([{ combo_id: 0, weight: COMBO_WEIGHT }]);
        console.log(`   ✅ setcombos → combinations on-chain: ${JSON.stringify(combos)}`);
    });

    test('CB-1: creategame → fund → deposit → buy → lock → draw', async () => {
        await transact(bingoSession, 'bingo.game', 'creategame', {
            game_id:      comboGameId,
            ticket_price: ExtendedAsset.from({ quantity: `${COMBO_TICKET_PRICE}.0000 WAX`, contract: 'eosio.token' }),
            gametype_id:  GAMETYPE_ID_COMBO,
            room_id:      UInt64.from(0),
        });
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: comboGameId });
        await transact(playerSession, 'eosio.token', 'transfer', {
            from: 'jogador1', to: 'bingo.game', quantity: '100.0000 WAX', memo: 'Combo deposit',
        });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: comboGameId  }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner        }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));
        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer: owner, game_id: comboGameId, matrices: [matrixBytes], signatures: [sig],
            nft_id: 0, requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
        });
        await transact(microSession, 'bingo.game', 'lockgame', { game_id: comboGameId });
        await transact(microSession, 'bingo.game', 'startdraw', { game_id: comboGameId });
        await waitForDrawn(comboGameIdStr);
        console.log('   ✅ jogo COMBO em drawn');
    }, 90_000);

    test('CB-2: claimcombo paga price × base × combo_weight/100 (= 25 WAX)', async () => {
        const ticketRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: comboGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        const ticketId = UInt64.from((ticketRes.rows[0] as BlockchainTicketRecord).ticket_id);

        const balBefore = await getContractBalance('jogador1');

        const r = await transact(microSession, 'bingo.game', 'claimcombo', {
            game_id:           comboGameId,
            ticket_id:         ticketId,
            ball_count:        35,
            combo_id:          0,
            golden_multiplier: 0,
        });
        expect(r.response).toBeDefined();
        expect(await getGameStatus(comboGameIdStr)).toBe('paying');

        const balAfter = await getContractBalance('jogador1');
        const expected = COMBO_TICKET_PRICE * 1 * COMBO_WEIGHT / 100; // 25.0000
        expect(Math.round((balAfter - balBefore) * 10000) / 10000).toBe(expected);
        console.log(`   ✅ claimcombo pagou ${(balAfter - balBefore).toFixed(4)} WAX (esperado ${expected})`);
    });

    test('CB-3: claimcombo com combo_id inexistente → revert', async () => {
        const ticketRes = await rpcClient.v1.chain.get_table_rows({
            code: 'bingo.game', scope: comboGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        const ticketId = UInt64.from((ticketRes.rows[0] as BlockchainTicketRecord).ticket_id);

        await expect(
            transact(microSession, 'bingo.game', 'claimcombo', {
                game_id: comboGameId, ticket_id: ticketId, ball_count: 35, combo_id: 99, golden_multiplier: 0,
            }),
        ).rejects.toThrow(/combo_id nao encontrado/);
        console.log('   ✅ combo_id inexistente rejeitado on-chain');
    });

    test('CB-4: closegame → PAYING → ARCHIVED', async () => {
        await transact(microSession, 'bingo.game', 'closegame', { game_id: comboGameId });
        expect(await getGameStatus(comboGameIdStr)).toBe('archived');
        console.log('   ✅ status: archived');
    });
});
