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

import { APIClient, PrivateKey, Session }                              from '@wharfkit/session';
import { WalletPluginPrivateKey }                                       from '@wharfkit/wallet-plugin-privatekey';
import { Serializer, Checksum256, Name, UInt64, ExtendedAsset, Bytes } from '@wharfkit/antelope';

import { applyDrawnBalls, checkWinPatterns } from '../../worker-game-loop/src/services/evaluator';
import { BlockchainTicketRecord }           from '../../../packages/shared-types/src';

// ==========================================
// CONFIG
// ==========================================

const url     = process.env.RPC_URL  || 'http://127.0.0.1:8888';
const chainId = process.env.CHAIN_ID || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
const client  = new APIClient({ url });

const eosioKey  = PrivateKey.from(process.env.EOSIO_KEY!);
const playerKey = PrivateKey.from(process.env.JOGADOR1_KEY!);
const bingoKey  = PrivateKey.from(process.env.BINGO_GAME_KEY!);

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
const microSession  = makeSession('microservice', eosioKey);

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
    const res = await client.v1.chain.get_table_rows({
        code: 'bingo.game', scope: 'bingo.game', table: 'games',
        lower_bound: gameIdStr, upper_bound: gameIdStr,
        limit: 1, json: true,
    });
    return res.rows[0]?.status ?? 'not_found';
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
            game_id:     mainGameId,
            ticket_price: ExtendedAsset.from({ quantity: '10.0000 TLM', contract: 'eosio.token' }),
            gametype_id: GAMETYPE_ID_STD,
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
            quantity: '500.0000 TLM', memo: 'Deposito para jogar',
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
            buyer: owner, game_id: mainGameId,
            matrices: [matrixBytes], signatures: [sig], nft_id: 0,
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
            client.v1.chain.get_table_rows({
                code: 'bingo.game', scope: 'bingo.game', table: 'games',
                lower_bound: mainGameIdStr, upper_bound: mainGameIdStr, limit: 1, json: true,
            }),
            client.v1.chain.get_table_rows({
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
            amount: ExtendedAsset.from({ quantity: '100.0000 TLM', contract: 'eosio.token' }),
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
            game_id:     abortGameId,
            ticket_price: ExtendedAsset.from({ quantity: '5.0000 TLM', contract: 'eosio.token' }),
            gametype_id: UInt64.from(0),
        });
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: abortGameId });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes  }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: abortGameId  }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner        }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer: owner, game_id: abortGameId,
            matrices: [matrixBytes], signatures: [sig], nft_id: 0,
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
        const ticketRes = await client.v1.chain.get_table_rows({
            code: 'bingo.game', scope: abortGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        expect(ticketRes.rows.length).toBeGreaterThan(0);

        await transact(playerSession, 'bingo.game', 'refundticket', {
            game_id: abortGameId, ticket_id: UInt64.from(ticketRes.rows[0].ticket_id),
        });

        const check = await client.v1.chain.get_table_rows({
            code: 'bingo.game', scope: abortGameIdStr, table: 'tickets', limit: 1, json: true,
        });
        expect(check.rows.length).toBe(0);
        console.log('   ✅ Cartela estornada e apagada');
    });

    test('cleargame → GC (ABORTED sem quarentena)', async () => {
        await transact(microSession, 'bingo.game', 'cleargame', {
            game_id: abortGameId, max_rows: 100,
        });
        const check = await client.v1.chain.get_table_rows({
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
            game_id:     mmGameId,
            ticket_price: ExtendedAsset.from({ quantity: '10.0000 TLM', contract: 'eosio.token' }),
            gametype_id: GAMETYPE_ID_MM,
        });
        await transact(microSession, 'bingo.game', 'fundgame', { game_id: mmGameId });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: mmGameId    }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner       }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer: owner, game_id: mmGameId, matrices: [matrixBytes], signatures: [sig], nft_id: 0,
        });
        await transact(microSession, 'bingo.game', 'lockgame',  { game_id: mmGameId });
        await transact(microSession, 'bingo.game', 'startdraw', { game_id: mmGameId });
        await waitForDrawn(mmGameIdStr);

        expect(await getGameStatus(mmGameIdStr)).toBe('drawn');
        console.log('   ✅ Jogo MULTI_MATCH sorteado → status: drawn (oracle ORNG)');
    }, 90_000);

    test('MM-2: claimstage stage 1 → DRAWN → PAYING', async () => {
        const ticketRes = await client.v1.chain.get_table_rows({
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
        const ticketRes = await client.v1.chain.get_table_rows({
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
            game_id: payingGameId,
            ticket_price: ExtendedAsset.from({ quantity: '5.0000 TLM', contract: 'eosio.token' }),
            gametype_id: GAMETYPE_ID_STD,
        });
        await transact(microSession, 'bingo.game', 'fundgame',   { game_id: payingGameId });

        const matrixBytes = Bytes.from(new Uint8Array(TEST_MATRIX));
        const owner       = Name.from('jogador1');
        const matBuf  = Serializer.encode({ type: 'bytes',  object: matrixBytes  }).array;
        const gameBuf = Serializer.encode({ type: 'uint64', object: payingGameId }).array;
        const ownBuf  = Serializer.encode({ type: 'name',   object: owner        }).array;
        const sig     = bingoKey.signDigest(Checksum256.hash(new Uint8Array([...matBuf, ...gameBuf, ...ownBuf])));

        await transact(playerSession, 'bingo.game', 'buytickets', {
            buyer: owner, game_id: payingGameId, matrices: [matrixBytes], signatures: [sig], nft_id: 0,
        });
        await transact(microSession, 'bingo.game', 'lockgame',  { game_id: payingGameId });
        await transact(microSession, 'bingo.game', 'startdraw', { game_id: payingGameId });
        await waitForDrawn(payingGameStr);

        const ticketRes = await client.v1.chain.get_table_rows({
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
