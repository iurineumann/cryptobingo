// apps/harness/tests/xp-progression.test.ts
// E2E de XP/progression (ADR-028 2D) — awardXP + achievements pos-FSM.

import { PrivateKey, Session }                              from '@wharfkit/session';
import { WalletPluginPrivateKey }                                         from '@wharfkit/wallet-plugin-privatekey';
import { Serializer, Checksum256, Name, UInt64, ExtendedAsset, Bytes }   from '@wharfkit/antelope';
import { rpcClient } from '@cryptobingo/blockchain-core';
import mongoose from 'mongoose';

import { applyDrawnBalls } from '../../worker-game-loop/src/services/evaluator';
import { awardTicketPurchaseXP, awardWinXP } from '../../worker-game-loop/src/services/xpEngine';
import { PlayerProgression } from '../../worker-game-loop/src/models/playerProgression';
import { checkWinAchievements } from '../../worker-game-loop/src/services/achievementEngine';
import type { BlockchainTicketRecord } from '@cryptobingo/shared-types';

const MONGO_URI   = process.env.MONGO_URL || 'mongodb://mongo_admin:mongo_secure_pass_2026@localhost:27017/cryptobingo_edge?authSource=admin';
const url         = process.env.RPC_URL  || 'http://127.0.0.1:8888';
const chainId     = process.env.CHAIN_ID || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';

const eosioKey = PrivateKey.from(process.env.EOSIO_KEY!);
const playerKey = PrivateKey.from(process.env.JOGADOR1_KEY!);
const bingoKey  = PrivateKey.from((process.env.BINGO_GAME_KEY || process.env.BINGOGAMECTR_KEY || process.env.CONTRACT_PRIVATE_KEY)!);
const microKey  = PrivateKey.from((process.env.MICROSERVICE_KEY || process.env.BINGOGAMESVC_KEY || process.env.MICROSERVICE_PRIVATE_KEY)!);

function makeSession(actor: string, key: PrivateKey, permission = 'active') {
    return new Session({
        actor, permission,
        chain: { id: chainId, url },
        walletPlugin: new WalletPluginPrivateKey(key),
    });
}

const rootSession   = makeSession('eosio', eosioKey);
const bingoSession  = makeSession('bingogamectr', bingoKey, 'admin');
const playerSession = makeSession('jogador1', playerKey);
const microSession  = makeSession('bingogamesvc', microKey);

const MASK_ROW0 = BigInt(1082401);
const MASK_ROW1 = BigInt(2164802);
const PATTERN_ID_ROW0 = UInt64.from(1);
const PATTERN_ID_ROW1 = UInt64.from(2);
let GAMETYPE_ID_XP  = UInt64.from(10);

const TEST_MATRIX = [
    1, 2, 3, 4, 5,
    6, 7, 8, 9, 10,
    11, 13, 14, 40,
    15, 16, 17, 18, 19,
    20, 21, 22, 23, 24,
];

function randomGameName(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz12345';
    let s = 'x';
    for (let i = 0; i < 11; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

async function transact(session: Session, account: string, name: string, data: object) {
    return session.transact({
        actions: [{
            account, name,
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
            code: 'bingogamectr', scope: 'bingogamectr', table: 'games',
            lower_bound: gameIdStr, upper_bound: gameIdStr,
            limit: 1, json: true,
        }),
    }).then(r => r.json() as any);
    return res.rows?.[0]?.status ?? 'not_found';
}

async function waitForDrawn(gameIdStr: string, attempts = 30): Promise<void> {
    for (let i = 0; i < attempts; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if ((await getGameStatus(gameIdStr)) === 'drawn') return;
    }
    throw new Error(`Timeout: ${gameIdStr} ainda em 'drawing' apos ${attempts * 2}s`);
}

// ==========================================

describe('XP/Progression — awardXP apos FSM completa', () => {

    let xpGameId:    UInt64;
    let xpGameIdStr: string;

    let xpRoomId: UInt64;

    beforeAll(async () => {
        if (!process.env.EOSIO_KEY) return;

        const n = Name.from(randomGameName());
        xpGameId    = n.value;
        xpGameIdStr = n.toString();
        console.log(`\nJogo XP: ${xpGameIdStr} (${xpGameId})\n`);

        await mongoose.connect(MONGO_URI);
        console.log('  MongoDB conectado');

        // Find free room + gametype ids
        const [roomRows, typeRows] = await Promise.all([
            rpcClient.v1.chain.get_table_rows({
                code: 'bingogamectr', scope: 'bingogamectr', table: 'rooms', limit: 100, json: true,
            }),
            rpcClient.v1.chain.get_table_rows({
                code: 'bingogamectr', scope: 'bingogamectr', table: 'gametypes', limit: 100, json: true,
            }),
        ]);
        const usedRooms = new Set(roomRows.rows.map((r: any) => Number(r.room_id)));
        const usedTypes = new Set(typeRows.rows.map((r: any) => Number(r.gametype_id)));
        let roomId = 100;
        while (usedRooms.has(roomId)) roomId++;
        xpRoomId = UInt64.from(roomId);
        let typeId = 10;
        while (usedTypes.has(typeId)) typeId++;
        GAMETYPE_ID_XP = UInt64.from(typeId);
        console.log(`  Room XP: ${xpRoomId}, Gametype XP: ${GAMETYPE_ID_XP}`);

        try {
            await transact(bingoSession, 'bingogamectr', 'addpattern', {
                pattern_id: PATTERN_ID_ROW0, name: 'ROW_0', mask: Number(MASK_ROW0),
            });
            await transact(bingoSession, 'bingogamectr', 'addpattern', {
                pattern_id: PATTERN_ID_ROW1, name: 'ROW_1', mask: Number(MASK_ROW1),
            });
        } catch { /* ok */ }
        try {
            await transact(bingoSession, 'bingogamectr', 'addgametype', {
                gametype_id: GAMETYPE_ID_XP, name: 'XPTest', base_multiplier: 1,
                rules: [{ pattern_id: PATTERN_ID_ROW0, weight: 10 }],
                draw_mode: 'standard', max_balls: 35,
                golden_ball_after: 0, master_weight_ovrd: 0,
            });
        } catch { /* ok */ }

        // Creates room so awardWinXP sees non-zero room_id
        const price = ExtendedAsset.from({ quantity: '50.0000 WAX', contract: 'eosio.token' });
        try {
            await transact(bingoSession, 'bingogamectr', 'createroom', {
                room_id: xpRoomId, sponsor: 'bingogamectr',
                gametype_id: GAMETYPE_ID_XP,
                ticket_price_min: price, ticket_price_max: price, ticket_price_default: price,
                max_tickets_per_player: 10, sponsor_room: false,
            });
        } catch { /* ok */ }
        try {
            await transact(bingoSession, 'bingogamectr', 'activateroom', { room_id: xpRoomId });
        } catch { /* ok */ }
    }, 30_000);

    afterAll(async () => {
        if (process.env.EOSIO_KEY) await mongoose.disconnect();
    });

    test('XP-0: perfil jogador1 limpo em MongoDB', async () => {
        if (!process.env.EOSIO_KEY) return;
        await PlayerProgression.deleteOne({ wallet_address: 'jogador1' });
        const p = await PlayerProgression.findOne({ wallet_address: 'jogador1' }).lean();
        expect(p).toBeNull();
    });

    test('XP-1: awardTicketPurchaseXP apos comprar cartela', async () => {
        if (!process.env.EOSIO_KEY) return;
        await transact(bingoSession, 'bingogamectr', 'creategame', {
            game_id: xpGameId,
            ticket_price: ExtendedAsset.from({ quantity: '10.0000 WAX', contract: 'eosio.token' }),
            gametype_id: GAMETYPE_ID_XP, room_id: xpRoomId,
        });
        await transact(microSession, 'bingogamectr', 'fundgame', { game_id: xpGameId });
        await transact(playerSession, 'eosio.token', 'transfer', {
            from: 'jogador1', to: 'bingogamectr',
            quantity: '100.0000 WAX', memo: 'XP deposit',
        });

        const mb = Bytes.from(new Uint8Array(TEST_MATRIX));
        const o  = Name.from('jogador1');
        const sig = microKey.signDigest(Checksum256.hash(new Uint8Array([
            ...Serializer.encode({ type: 'bytes',  object: mb }).array,
            ...Serializer.encode({ type: 'uint64', object: xpGameId }).array,
            ...Serializer.encode({ type: 'name',   object: o }).array,
        ])));
        await transact(playerSession, 'bingogamectr', 'buytickets', {
            buyer: o, game_id: xpGameId, matrices: [mb], signatures: [sig],
            nft_id: 0, requested_price: ExtendedAsset.from({ quantity: '0.0000 WAX', contract: 'eosio.token' }),
        });
        expect(await getGameStatus(xpGameIdStr)).toBe('funding');

        await awardTicketPurchaseXP(xpGameId.toString());
        const profile = await PlayerProgression.findOne({ wallet_address: 'jogador1' }).lean();
        expect(profile).not.toBeNull();
        expect(profile!.progression!.xp).toBeGreaterThanOrEqual(1);
        console.log(`  XP apos compra: ${profile!.progression!.xp}`);
    });

    test('XP-2: lock -> draw via oracle -> DRAWN', async () => {
        if (!process.env.EOSIO_KEY) return;
        await transact(microSession, 'bingogamectr', 'lockgame',  { game_id: xpGameId });
        await transact(microSession, 'bingogamectr', 'startdraw', { game_id: xpGameId });
        expect(await getGameStatus(xpGameIdStr)).toBe('drawing');
        await waitForDrawn(xpGameIdStr);
    }, 90_000);

    test('XP-3: awardWinXP + achievements apos claimwin', async () => {
        if (!process.env.EOSIO_KEY) return;
        const [gr, tr] = await Promise.all([
            rpcClient.v1.chain.get_table_rows({
                code: 'bingogamectr', scope: 'bingogamectr', table: 'games',
                lower_bound: xpGameIdStr, upper_bound: xpGameIdStr, limit: 1, json: true,
            }),
            rpcClient.v1.chain.get_table_rows({
                code: 'bingogamectr', scope: xpGameIdStr, table: 'tickets', limit: 1, json: true,
            }),
        ]);
        const drawn: number[] = gr.rows[0].drawn_balls;
        const ticket = tr.rows[0] as BlockchainTicketRecord;
        const tid = UInt64.from(ticket.ticket_id);

        const fs = applyDrawnBalls(ticket, drawn.slice(0, 35));
        let mask = UInt64.from(MASK_ROW0.toString());
        for (const m of [MASK_ROW0, MASK_ROW1]) {
            if ((BigInt(fs) & m) === m) { mask = UInt64.from(m.toString()); break; }
        }

        await transact(microSession, 'bingogamectr', 'claimwin', {
            game_id: xpGameId, ticket_id: tid,
            ball_count: 35, win_pattern_mask: mask,
            golden_multiplier: 0, boost_nft_ids: [],
        });
        expect(await getGameStatus(xpGameIdStr)).toBe('paying');

        await awardWinXP('jogador1', xpGameId.toString());
        const p = await PlayerProgression.findOne({ wallet_address: 'jogador1' }).lean();
        expect(p).not.toBeNull();
        const prog = p!.progression!;
        expect(prog.xp).toBeGreaterThanOrEqual(10);
        console.log(`  XP total: ${prog.xp}, level: ${prog.level}, tier: ${prog.tier}`);

        const wins = (p as any).wins_count ?? 0;
        await checkWinAchievements('jogador1', wins, false);
        const a = (await PlayerProgression.findOne({ wallet_address: 'jogador1' }).lean())?.achievements ?? [];
        expect(a.length).toBeGreaterThanOrEqual(1);
        console.log(`  Achievements: ${a.map((x: any) => x.id).join(', ')}`);
    });

    test('XP-4: closegame', async () => {
        if (!process.env.EOSIO_KEY) return;
        await transact(microSession, 'bingogamectr', 'closegame', { game_id: xpGameId });
        expect(await getGameStatus(xpGameIdStr)).toBe('archived');
    });
});
