import mongoose, { Schema, Document } from 'mongoose';
import { PlayerProgression } from '../models/playerProgression';
import { xpAwardedTotal, xpAmountTotal } from './metrics';
import { logger } from './logger';

const REWARDS: { xp: number; badge?: string; ticket?: boolean }[] = [
    { xp: 50 },
    { xp: 50 },
    { xp: 100 },
    { xp: 100, badge: 'week_warrior' },
    { xp: 150 },
    { xp: 150 },
    { xp: 250, ticket: true },
];

interface IDailyReward extends Document {
    wallet: string;
    cycleStart: string;
    claimedDays: number[];
    lastClaimDate: Date | null;
}

const DailyRewardSchema = new Schema<IDailyReward>({
    wallet:     { type: String, required: true },
    cycleStart: { type: String, required: true },
    claimedDays: { type: [Number], default: [] },
    lastClaimDate: { type: Date, default: null },
}, { timestamps: true });

DailyRewardSchema.index({ wallet: 1, cycleStart: -1 });

const DailyReward = mongoose.models.DailyReward
    || mongoose.model<IDailyReward>('DailyReward', DailyRewardSchema, 'daily_rewards');

function getCycleStart(): string {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    return monday.toISOString().slice(0, 10);
}

function todayInCycle(cycleStart: string): number {
    const start = new Date(cycleStart);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 86400000);
    return Math.min(Math.max(diff, 0), 6);
}

export async function getCycleStatus(wallet: string): Promise<{
    cycleStart: string;
    currentDay: number;
    claimedDays: number[];
    canClaimToday: boolean;
    rewards: typeof REWARDS;
}> {
    const cycleStart = getCycleStart();
    const doc = await DailyReward.findOne({ wallet, cycleStart }).lean();
    const claimedDays = doc?.claimedDays ?? [];
    const currentDay = todayInCycle(cycleStart);
    const canClaimToday = !claimedDays.includes(currentDay);
    return { cycleStart, currentDay, claimedDays, canClaimToday, rewards: REWARDS };
}

export async function claimDailyReward(wallet: string): Promise<{
    day: number;
    reward: { xp: number; badge?: string; ticket?: boolean };
    streak: number;
}> {
    const status = await getCycleStatus(wallet);
    if (!status.canClaimToday) {
        throw new Error('Reward already claimed today');
    }
    const reward = REWARDS[status.currentDay];
    await awardXp(wallet, reward.xp);
    if (reward.badge) {
        await awardBadgeAchievement(wallet, reward.badge);
    }
    if (reward.ticket) {
        await awardFreeTicket(wallet);
    }
    await DailyReward.updateOne(
        { wallet: wallet, cycleStart: status.cycleStart },
        {
            $push: { claimedDays: status.currentDay },
            $set: { lastClaimDate: new Date() },
        },
        { upsert: true },
    );
    const streak = await getStreak(wallet);
    return {
        day: status.currentDay,
        reward,
        streak,
    };
}

async function getStreak(wallet: string): Promise<number> {
    const days = await DailyReward.find({ wallet })
        .sort({ cycleStart: -1 })
        .limit(2)
        .lean();
    let count = 0;
    for (const doc of days) {
        count += doc.claimedDays.length;
    }
    return count;
}

async function awardXp(wallet: string, amount: number): Promise<void> {
    try {
        await PlayerProgression.updateOne(
            { wallet_address: wallet },
            { $inc: { 'progression.xp': amount } },
            { upsert: true },
        );
        xpAwardedTotal.inc({ type: 'daily_reward' });
        xpAmountTotal.inc({ type: 'daily_reward' }, amount);
    } catch (err) {
        logger.error({ err, tag: 'DailyReward' }, `Erro ao conceder XP para ${wallet}:`)
    }
}

async function awardBadgeAchievement(wallet: string, badge: string): Promise<void> {
    try {
        await PlayerProgression.updateOne(
            { wallet_address: wallet, 'achievements.id': { $ne: `daily_${badge}` } },
            { $push: { achievements: { id: `daily_${badge}`, unlocked_at: new Date() } } },
        );
    } catch (err) {
        logger.error({ err, tag: 'DailyReward' }, `Erro ao conceder badge ${badge} para ${wallet}:`)
    }
}

async function awardFreeTicket(wallet: string): Promise<void> {
    try {
        await PlayerProgression.updateOne(
            { wallet_address: wallet },
            { $inc: { 'progression.free_tickets': 1 } },
            { upsert: true },
        );
    } catch (err) {
        logger.error({ err, tag: 'DailyReward' }, `Erro ao conceder free ticket para ${wallet}:`)
    }
}
