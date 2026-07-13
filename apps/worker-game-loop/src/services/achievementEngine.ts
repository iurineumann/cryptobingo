import { PlayerProgression } from '../models/playerProgression';
import { achievementsUnlockedTotal } from './metrics';
import { logger } from './logger';

const ACHIEVEMENTS = [
    { id: 'first_win',    label: 'Primeira Vitória',        desc: 'Ganhe sua primeira partida',               icon: '🏆' },
    { id: 'win_5',        label: 'Colecionador (5)',         desc: 'Ganhe 5 partidas',                        icon: '🏅' },
    { id: 'win_25',       label: 'Colecionador (25)',        desc: 'Ganhe 25 partidas',                       icon: '🥇' },
    { id: 'win_100',      label: 'Colecionador (100)',       desc: 'Ganhe 100 partidas',                      icon: '👑' },
    { id: 'combo_1',      label: 'Combinador',               desc: 'Complete sua primeira combinação',         icon: '🔗' },
    { id: 'combo_10',     label: 'Mestre das Combos (10)',   desc: 'Complete 10 combinações',                  icon: '🔗' },
    { id: 'combo_50',     label: 'Mestre das Combos (50)',   desc: 'Complete 50 combinações',                  icon: '🔗' },
    { id: 'buy_10',       label: 'Apostador (10)',            desc: 'Compre 10 cartelas',                      icon: '🎫' },
    { id: 'buy_50',       label: 'Apostador (50)',            desc: 'Compre 50 cartelas',                      icon: '🎫' },
    { id: 'buy_250',      label: 'Apostador (250)',           desc: 'Compre 250 cartelas',                     icon: '🎫' },
    { id: 'buy_1000',     label: 'Apostador (1000)',          desc: 'Compre 1000 cartelas',                    icon: '🎫' },
    { id: 'games_10',     label: 'Veterano (10 jogos)',       desc: 'Participe de 10 partidas',                icon: '🎲' },
    { id: 'games_50',     label: 'Veterano (50 jogos)',       desc: 'Participe de 50 partidas',                icon: '🎲' },
    { id: 'games_200',    label: 'Veterano (200 jogos)',      desc: 'Participe de 200 partidas',               icon: '🎲' },
    { id: 'streak_7',     label: 'Sequência (7 dias)',        desc: 'Mantenha sequência de 7 dias',            icon: '🔥' },
    { id: 'streak_14',    label: 'Sequência (14 dias)',       desc: 'Mantenha sequência de 14 dias',           icon: '🔥' },
    { id: 'streak_30',    label: 'Sequência (30 dias)',       desc: 'Mantenha sequência de 30 dias',           icon: '🔥' },
    { id: 'burn_1',       label: 'Queimador',                 desc: 'Queime seu primeiro NFT',                 icon: '🔥' },
    { id: 'burn_10',      label: 'Incinerador (10)',          desc: 'Queime 10 NFTs',                          icon: '🔥' },
    { id: 'burn_50',      label: 'Incinerador (50)',          desc: 'Queime 50 NFTs',                          icon: '🔥' },
    { id: 'golden_win',   label: 'Bola de Ouro',              desc: 'Ganhe com a Golden Ball ativa',            icon: '🌟' },
    { id: 'stage_win',    label: 'Multi-Estágio',             desc: 'Vença um estágio em modo MultiMatch',      icon: '🎯' },
    { id: 'tier_bronze',  label: 'Patamar Bronze',            desc: 'Alcance o tier Bronze',                   icon: '🥉' },
    { id: 'tier_prata',   label: 'Patamar Prata',             desc: 'Alcance o tier Prata',                    icon: '🥈' },
    { id: 'tier_ouro',    label: 'Patamar Ouro',              desc: 'Alcance o tier Ouro',                     icon: '🪙' },
    { id: 'tier_platina', label: 'Patamar Platina',           desc: 'Alcance o tier Platina',                  icon: '💿' },
    { id: 'tier_esmeralda', label: 'Patamar Esmeralda',       desc: 'Alcance o tier Esmeralda',                icon: '💚' },
    { id: 'tier_safira',  label: 'Patamar Safira',            desc: 'Alcance o tier Safira',                   icon: '💎' },
    { id: 'tier_rubi',    label: 'Patamar Rubi',              desc: 'Alcance o tier Rubi',                     icon: '❤️' },
    { id: 'tier_diamante', label: 'Patamar Diamante',         desc: 'Alcance o tier Diamante',                 icon: '💎' },
] as const;

export type AchievementId = typeof ACHIEVEMENTS[number]['id'];

export function getAchievementInfo(id: string) {
    return ACHIEVEMENTS.find(a => a.id === id);
}

const COUNTER_MILESTONES: Record<string, number> = {
    win_5: 5, win_25: 25, win_100: 100,
    combo_1: 1, combo_10: 10, combo_50: 50,
    buy_10: 10, buy_50: 50, buy_250: 250, buy_1000: 1000,
    games_10: 10, games_50: 50, games_200: 200,
    streak_7: 7, streak_14: 14, streak_30: 30,
    burn_1: 1, burn_10: 10, burn_50: 50,
};

const TIER_ACHIEVEMENTS: Record<string, string> = {
    Bronze: 'tier_bronze', Prata: 'tier_prata', Ouro: 'tier_ouro',
    Platina: 'tier_platina', Esmeralda: 'tier_esmeralda',
    Safira: 'tier_safira', Rubi: 'tier_rubi', Diamante: 'tier_diamante',
};

async function unlock(wallet: string, achievementId: string): Promise<boolean> {
    try {
        const res = await PlayerProgression.updateOne(
            { wallet_address: wallet, 'achievements.id': { $ne: achievementId } },
            { $push: { achievements: { id: achievementId, unlocked_at: new Date() } } },
        );
        if (res.modifiedCount > 0) {
            logger.info({ tag: 'Achievement' }, `${wallet} desbloqueou: ${achievementId}`)
            achievementsUnlockedTotal.inc({ achievement_id: achievementId });
            return true;
        }
        return false;
    } catch (err) {
        logger.error({ err, tag: 'Achievement' }, `Erro ao desbloquear ${achievementId} para ${wallet}:`)
        return false;
    }
}

async function counterUnlock(wallet: string, counter: Record<string, number>): Promise<void> {
    for (const [id, threshold] of Object.entries(COUNTER_MILESTONES)) {
        const current = counter[id] ?? 0;
        if (current >= threshold) {
            await unlock(wallet, id);
        }
    }
}

export async function checkWinAchievements(wallet: string, totalWins: number, isGolden: boolean): Promise<void> {
    await counterUnlock(wallet, { win_5: totalWins, win_25: totalWins, win_100: totalWins });
    if (totalWins >= 1) await unlock(wallet, 'first_win');
    if (isGolden) await unlock(wallet, 'golden_win');
}

export async function checkComboAchievements(wallet: string, totalCombos: number): Promise<void> {
    await counterUnlock(wallet, { combo_1: totalCombos, combo_10: totalCombos, combo_50: totalCombos });
}

export async function checkPurchaseAchievements(wallet: string, totalBought: number): Promise<void> {
    await counterUnlock(wallet, { buy_10: totalBought, buy_50: totalBought, buy_250: totalBought, buy_1000: totalBought });
}

export async function checkGamesPlayedAchievements(wallet: string, totalGames: number): Promise<void> {
    await counterUnlock(wallet, { games_10: totalGames, games_50: totalGames, games_200: totalGames });
}

export async function checkStreakAchievements(wallet: string, streakCount: number): Promise<void> {
    await counterUnlock(wallet, { streak_7: streakCount, streak_14: streakCount, streak_30: streakCount });
}

export async function checkBurnAchievements(wallet: string, totalBurns: number): Promise<void> {
    await counterUnlock(wallet, { burn_1: totalBurns, burn_10: totalBurns, burn_50: totalBurns });
}

export async function checkTierAchievements(wallet: string, tier: string): Promise<void> {
    const achievementId = TIER_ACHIEVEMENTS[tier];
    if (achievementId) await unlock(wallet, achievementId);
}

export async function checkStageWinAchievement(wallet: string): Promise<void> {
    await unlock(wallet, 'stage_win');
}

export { ACHIEVEMENTS };
export default ACHIEVEMENTS;
