import { rpcClient, fetchGame } from '@cryptobingo/blockchain-core';
import { PlayerProgression } from '../models/playerProgression';
import { getRarity } from './atomicSchema';

const PHI = 1.618034;
const BASE_XP = 906;
const N_PER_TIER = 25;
const MAX_LEVEL = 225;
const TIERS = ['Cobre','Bronze','Prata','Ouro','Platina','Esmeralda','Safira','Rubi','Diamante'];
const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';

function tierXp(t: number): number {
    return Math.floor(BASE_XP * Math.pow(PHI, t));
}

function tierThreshold(t: number): number {
    return Math.floor(BASE_XP * (Math.pow(PHI, t + 1) - 1) / (PHI - 1));
}

export function totalXp(level: number): number {
    if (level <= 0) return 0;
    if (level >= MAX_LEVEL) return tierThreshold(8);
    const t = Math.min(8, Math.floor((level - 1) / N_PER_TIER));
    const inTier = level - t * N_PER_TIER;
    const prev = t > 0 ? tierThreshold(t - 1) : 0;
    const range = tierXp(t);
    return prev + Math.floor(range * Math.pow(inTier / N_PER_TIER, 2));
}

export function deriveLevel(xp: number): { level: number; tier: string; sub_level: number } {
    let lo = 1, hi = MAX_LEVEL;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (totalXp(mid) <= xp) lo = mid;
        else hi = mid - 1;
    }
    const t = Math.min(8, Math.floor((lo - 1) / N_PER_TIER));
    return { level: lo, tier: TIERS[t], sub_level: ((lo - 1) % N_PER_TIER) + 1 };
}

export async function getDifficulty(roomId: string): Promise<number> {
    try {
        const res = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT, table: 'rooms',
            lower_bound: roomId as any, upper_bound: roomId as any,
            limit: 1, json: true,
        });
        const room = res.rows[0] as any;
        if (room?.difficulty !== undefined && room.difficulty !== null) {
            const d = Number(room.difficulty);
            return d > 0 ? Math.min(d, 10) : 1;
        }
        return 1;
    } catch {
        return 1;
    }
}

async function ensureDailyStreak(wallet: string): Promise<number> {
    try {
        const doc = await PlayerProgression.findOne({ wallet_address: wallet });
        if (!doc) return 0;
        const today = new Date().toISOString().slice(0, 10);
        if (doc.daily_streak?.last_date === today) {
            return doc.daily_streak.count || 0;
        }
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        let count = 1;
        if (doc.daily_streak?.last_date === yesterday) {
            count = Math.min((doc.daily_streak.count || 0) + 1, 30);
        }
        await PlayerProgression.updateOne(
            { wallet_address: wallet },
            { $set: { 'daily_streak.last_date': today, 'daily_streak.count': count } },
        );
        return count;
    } catch {
        return 0;
    }
}

async function recalcLevel(wallet: string): Promise<void> {
    try {
        const doc = await PlayerProgression.findOne({ wallet_address: wallet });
        if (!doc?.progression) return;
        const total = doc.progression.xp || 0;
        const derived = deriveLevel(total);
        if (derived.level !== doc.progression.level) {
            await PlayerProgression.updateOne(
                { wallet_address: wallet },
                { $set: { 'progression.level': derived.level, 'progression.tier': derived.tier, 'progression.sub_level': derived.sub_level } },
            );
        }
    } catch (err) {
        console.error(`[XP] Erro ao recalcular level de ${wallet}:`, err);
    }
}

export async function awardPlayerXP(wallet: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const streakCount = await ensureDailyStreak(wallet);
    const totalAmount = amount + streakCount * 2;
    await PlayerProgression.updateOne(
        { wallet_address: wallet },
        { $inc: { 'progression.xp': totalAmount, 'progression.games_played': 1 } },
        { upsert: true },
    ).catch(err => console.error(`[XP] Erro ao incrementar XP de ${wallet}:`, err));
    await recalcLevel(wallet);
}

export async function awardWinXP(wallet: string, gameId: string, isVip = false): Promise<void> {
    const game = await fetchGame(gameId).catch(() => null);
    if (!game) return;
    const roomId = String((game as any).room_id ?? '0');
    if (roomId === '0') return;
    const diff = await getDifficulty(roomId);
    const xp = (isVip ? 25 : 10) * diff;
    await awardPlayerXP(wallet, xp);
}

export async function awardComboXP(wallet: string): Promise<void> {
    await awardPlayerXP(wallet, 15);
}

export async function awardBurnXP(wallet: string, collection: string, templateId: string | number): Promise<void> {
    const rarity = await getRarity(collection, templateId);
    await awardPlayerXP(wallet, 50 + rarity * 10);
}

export async function awardTicketPurchaseXP(gameId: string): Promise<void> {
    const tickets: any[] = [];
    let lowerBound: string | undefined;
    let hasMore = true;
    while (hasMore) {
        const res = await rpcClient.v1.chain.get_table_rows({
            code: CONTRACT_ACCOUNT, scope: gameId as any, table: 'tickets',
            key_type: 'i64', limit: 100,
            lower_bound: lowerBound as any, json: true,
        });
        tickets.push(...res.rows);
        hasMore = !!res.more && !!res.next_key;
        lowerBound = res.next_key as string;
    }
    const perOwner = new Map<string, number>();
    for (const t of tickets) {
        const owner = String((t as any).owner ?? '');
        if (owner) perOwner.set(owner, (perOwner.get(owner) || 0) + 1);
    }
    for (const [wallet, count] of perOwner) {
        await awardPlayerXP(wallet, count * 1).catch(err =>
            console.error(`[XP] Erro ao conceder XP de compra para ${wallet}:`, err)
        );
    }
}
