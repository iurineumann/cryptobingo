import { useState, useEffect, useCallback } from 'react';
import { getCycleStatus, claimDailyReward } from '../services/api';

interface Reward {
    xp: number;
    badge?: string;
    ticket?: boolean;
}

interface CycleStatus {
    cycleStart: string;
    currentDay: number;
    claimedDays: number[];
    canClaimToday: boolean;
    rewards: Reward[];
}

interface ClaimResult {
    day: number;
    reward: Reward;
    streak: number;
}

export function useDailyRewards() {
    const [status, setStatus] = useState<CycleStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getCycleStatus();
            setStatus(data);
        } catch (err) {
            setError('Erro ao carregar recompensas diárias.');
            console.error('[DailyRewards] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const claim = useCallback(async (): Promise<ClaimResult | null> => {
        try {
            setClaiming(true);
            setError(null);
            const data = await claimDailyReward();
            await fetchStatus();
            return data;
        } catch (err: any) {
            if (err?.response?.status === 409) {
                setError('Recompensa já resgatada hoje.');
            } else {
                setError('Erro ao resgatar recompensa.');
            }
            return null;
        } finally {
            setClaiming(false);
        }
    }, [fetchStatus]);

    return { status, loading, claiming, error, claim, refresh: fetchStatus };
}
