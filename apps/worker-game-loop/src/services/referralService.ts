import mongoose, { Schema, Document } from 'mongoose';
import { PlayerProgression } from '../models/playerProgression';
import { logger } from './logger';

interface IReferral extends Document {
    wallet: string;
    referralCode: string;
    referred: string[];
    rewards: { xpAwarded: number; ticketsAwarded: number };
    createdAt: Date;
}

const ReferralSchema = new Schema<IReferral>({
    wallet: { type: String, required: true },
    referralCode: { type: String, required: true, unique: true },
    referred: [{ type: String }],
    rewards: {
        xpAwarded: { type: Number, default: 0 },
        ticketsAwarded: { type: Number, default: 0 },
    },
}, { timestamps: true });

ReferralSchema.index({ referralCode: 1 }, { unique: true });

const Referral = mongoose.models.Referral
    || mongoose.model<IReferral>('Referral', ReferralSchema, 'referrals');

const TIERS = [
    { min: 100, badge: 'diamond_referrer' },
    { min: 50, badge: 'platinum_referrer' },
    { min: 25, badge: 'gold_referrer' },
    { min: 10, badge: 'silver_referrer' },
    { min: 5, badge: 'bronze_referrer' },
];

function generateCode(wallet: string): string {
    const seed = wallet.slice(0, 8) + Date.now().toString(36);
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const code = Math.abs(hash).toString(36).toUpperCase().slice(0, 6);
    return code;
}

export async function generateReferralCode(wallet: string): Promise<string> {
    const existing = await Referral.findOne({ wallet });
    if (existing) return existing.referralCode;

    let code: string;
    let attempts = 0;
    do {
        code = generateCode(wallet);
        attempts++;
    } while (await Referral.findOne({ referralCode: code }) && attempts < 10);

    await Referral.create({ wallet, referralCode: code, referred: [], rewards: { xpAwarded: 0, ticketsAwarded: 0 } });
    return code;
}

export async function processReferralBuyin(referralCode: string, refereeWallet: string, buyinXp: number): Promise<void> {
    if (!referralCode || !refereeWallet) return;

    const referrer = await Referral.findOne({ referralCode });
    if (!referrer) return;
    if (referrer.wallet === refereeWallet) return;
    if (referrer.referred.includes(refereeWallet)) return;

    const xpReward = Math.round(buyinXp * 0.1);
    const ticketReward = 1;

    await Referral.updateOne(
        { referralCode },
        {
            $push: { referred: refereeWallet },
            $inc: {
                'rewards.xpAwarded': xpReward,
                'rewards.ticketsAwarded': ticketReward,
            },
        },
    );

    await PlayerProgression.updateOne(
        { wallet_address: referrer.wallet },
        { $inc: { 'progression.xp': xpReward, 'progression.free_tickets': ticketReward } },
        { upsert: true },
    );

    await PlayerProgression.updateOne(
        { wallet_address: refereeWallet },
        { $inc: { 'progression.free_tickets': ticketReward } },
        { upsert: true },
    );

    const tierBadge = getTierBadge(referrer.referred.length + 1);
    if (tierBadge) {
        await PlayerProgression.updateOne(
            { wallet_address: referrer.wallet, 'achievements.id': { $ne: tierBadge } },
            { $push: { achievements: { id: tierBadge, unlocked_at: new Date() } } },
        );
    }

    logger.info({ tag: 'Referral' }, `${referrer.wallet} indicou ${refereeWallet}: +${xpReward}XP +${ticketReward}ticket`)
}

export async function getReferralStats(wallet: string): Promise<{
    code: string;
    totalReferred: number;
    xpEarned: number;
    ticketsEarned: number;
    tier: string | null;
    nextTier: { target: number; remaining: number } | null;
}> {
    const doc = await Referral.findOne({ wallet });
    if (!doc) {
        const code = await generateReferralCode(wallet);
        return { code, totalReferred: 0, xpEarned: 0, ticketsEarned: 0, tier: null, nextTier: { target: 5, remaining: 5 } };
    }

    const totalReferred = doc.referred.length;
    const tier = getTierBadge(totalReferred);
    const nextTier = getNextTier(totalReferred);

    return {
        code: doc.referralCode,
        totalReferred,
        xpEarned: doc.rewards.xpAwarded,
        ticketsEarned: doc.rewards.ticketsAwarded,
        tier,
        nextTier: nextTier ? { target: nextTier.min, remaining: nextTier.min - totalReferred } : null,
    };
}

export async function getTopReferrers(limit = 10): Promise<{ wallet: string; totalReferred: number }[]> {
    const docs = await Referral.find({})
        .sort({ 'referred': -1 })
        .limit(limit)
        .lean();
    return docs.map(d => ({ wallet: d.wallet, totalReferred: d.referred.length }));
}

function getTierBadge(total: number): string | null {
    for (const t of TIERS) {
        if (total >= t.min) return t.badge;
    }
    return null;
}

function getNextTier(total: number): { min: number; badge: string } | null {
    for (let i = TIERS.length - 1; i >= 0; i--) {
        if (total < TIERS[i].min) return TIERS[i];
    }
    return null;
}
