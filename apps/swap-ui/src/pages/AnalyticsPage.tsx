// apps/swap-ui/src/pages/AnalyticsPage.tsx
// ADR-022 — painel de analytics do bingo.swap (somente leitura).
// Mostra TVL estimado, volume e tabela de pools com reservas.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SwapPoolSummary } from '@cryptobingo/shared-types';
import { fetchSwapPools } from '../services/swapService';

function formatReserve(raw: string): string {
    // "1000000.0000 BINGO" → "1,000,000.0000 BINGO"
    const [amount, sym] = raw.split(' ');
    if (!amount) return raw;
    const [whole, frac] = amount.split('.');
    const fmt = Number(whole).toLocaleString();
    return frac ? `${fmt}.${frac} ${sym ?? ''}` : `${fmt} ${sym ?? ''}`;
}

export default function AnalyticsPage() {
    const { t } = useTranslation();
    const [pools,     setPools]     = useState<SwapPoolSummary[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [updatedAt, setUpdatedAt] = useState('');

    useEffect(() => {
        fetchSwapPools()
            .then(ps => {
                setPools(ps);
                setUpdatedAt(new Date().toLocaleTimeString());
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="cb-container py-10">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">{t('analytics.title')}</h1>
                {updatedAt && (
                    <p className="cb-muted text-xs" data-testid="analytics-updated">
                        {t('analytics.last_updated')} — {updatedAt}
                    </p>
                )}
            </div>

            {loading && <p className="cb-hint text-center py-12">{t('common.loading')}</p>}

            {!loading && pools.length === 0 && (
                <p className="cb-hint text-center py-12" data-testid="analytics-no-pools">
                    {t('analytics.no_pools')}
                </p>
            )}

            {!loading && pools.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="analytics-table">
                        <thead>
                            <tr className="border-b border-[--cb-border]">
                                <th className="text-left pb-2 pr-4">{t('analytics.pool_id')}</th>
                                <th className="text-left pb-2 pr-4">{t('analytics.pair')}</th>
                                <th className="text-right pb-2 pr-4">{t('analytics.reserve_a')}</th>
                                <th className="text-right pb-2 pr-4">{t('analytics.reserve_b')}</th>
                                <th className="text-right pb-2 pr-4">{t('analytics.fee_bps')}</th>
                                <th className="text-right pb-2">{t('analytics.service_fee_bps')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pools.map(p => {
                                const symA = p.token_a.symbol.split(',')[1] ?? '';
                                const symB = p.token_b.symbol.split(',')[1] ?? '';
                                const resA = formatReserve(
                                    `${(Number(p.reserve_a) / (10 ** p.token_a.precision)).toFixed(p.token_a.precision)} ${symA}`
                                );
                                const resB = formatReserve(
                                    `${(Number(p.reserve_b) / (10 ** p.token_b.precision)).toFixed(p.token_b.precision)} ${symB}`
                                );
                                return (
                                    <tr
                                        key={p.pool_id}
                                        className="border-b border-[--cb-border] hover:bg-[--cb-surface-hover]"
                                        data-testid={`analytics-row-${p.pool_id}`}
                                    >
                                        <td className="py-2 pr-4 font-mono">#{p.pool_id}</td>
                                        <td className="py-2 pr-4 font-semibold">{symA}/{symB}</td>
                                        <td className="py-2 pr-4 text-right font-mono text-xs">{resA}</td>
                                        <td className="py-2 pr-4 text-right font-mono text-xs">{resB}</td>
                                        <td className="py-2 pr-4 text-right">{p.fee_bps}</td>
                                        <td className="py-2 text-right">{p.service_fee_bps}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
