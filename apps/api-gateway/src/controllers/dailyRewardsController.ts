import { Request, Response } from 'express';
import mongoose, { Schema, Document } from 'mongoose';
import { UserProfile } from '../models/UserProfile';
import { logger } from '../middleware/logger';
import { getRequestId } from '../middleware/requestId';

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

export async function getDailyRewards(req: Request, res: Response): Promise<void> {
    try {
        const wallet = (req as any).user?.wallet;
        if (!wallet) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const cycleStart = getCycleStart();
        const doc = await DailyReward.findOne({ wallet, cycleStart }).lean();
        const claimedDays = doc?.claimedDays ?? [];
        const currentDay = todayInCycle(cycleStart);
        const canClaimToday = !claimedDays.includes(currentDay);
        res.status(200).json({ cycleStart, currentDay, claimedDays, canClaimToday, rewards: REWARDS });
    } catch (err) {
        logger.error({ err: err, tag: 'DailyRewards' }, 'Erro ao buscar status');
        res.status(500).json({ error: 'Erro ao buscar recompensas diárias.' });
    }
}

export async function claimDailyRewardHandler(req: Request, res: Response): Promise<void> {
    try {
        const wallet = (req as any).user?.wallet;
        if (!wallet) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const cycleStart = getCycleStart();
        const doc = await DailyReward.findOne({ wallet, cycleStart }).lean();
        const claimedDays = doc?.claimedDays ?? [];
        const currentDay = todayInCycle(cycleStart);
        if (claimedDays.includes(currentDay)) {
            res.status(409).json({ error: 'Recompensa já resgatada hoje.' });
            return;
        }
        const reward = REWARDS[currentDay];
        await DailyReward.updateOne(
            { wallet, cycleStart },
            { $push: { claimedDays: currentDay }, $set: { lastClaimDate: new Date() } },
            { upsert: true },
        );
        const updates: Record<string, number> = { 'progression.xp': reward.xp };
        if (reward.ticket) {
            updates['progression.free_tickets'] = 1;
        }
        await UserProfile.updateOne(
            { wallet_address: wallet },
            { $inc: updates },
            { upsert: true },
        );
        if (reward.badge && mongoose.connection.db) {
            const coll = mongoose.connection.db.collection('userprofiles');
            await coll.updateOne(
                { wallet_address: wallet, 'achievements.id': { $ne: `daily_${reward.badge}` } },
                { $push: { achievements: { id: `daily_${reward.badge}`, unlocked_at: new Date() } } } as any,
            );
        }
        const totalDocs = await DailyReward.find({ wallet }).sort({ cycleStart: -1 }).limit(2).lean();
        const streak = totalDocs.reduce((acc, d) => acc + d.claimedDays.length, 0);
        res.status(200).json({ day: currentDay, reward, streak });
    } catch (err: any) {
        logger.error({ err: err, tag: 'DailyRewards' }, 'Erro ao resgatar');
        res.status(500).json({ error: 'Erro ao resgatar recompensa diária.' });
    }
}
