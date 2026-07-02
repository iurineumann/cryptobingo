import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Name } from '@wharfkit/session';
import type { Session } from '@wharfkit/session';
import type { BlockchainGameState, ExtendedAsset } from '@cryptobingo/shared-types';
import { fetchRtpReport, fetchGamesHistory, type RtpReport, type GameHistoryEntry } from '../../services/api';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';

interface AdminDashboardProps {
    session?: Session;
}

export default function AdminDashboard({ session }: AdminDashboardProps = {}) {
    const { t } = useTranslation();
    const [games, setGames] = useState<BlockchainGameState[]>([]);
    const [rtp, setRtp] = useState<RtpReport | null>(null);
    const [history, setHistory] = useState<GameHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!session) return;
        (async () => {
            setLoading(true);
            try {
                const [gamesRes, rtpData, historyData] = await Promise.all([
                    session.client.v1.chain.get_table_rows({
                        code: CONTRACT, scope: CONTRACT,
                        table: 'games', limit: 50, json: true,
                    }),
                    fetchRtpReport(30).catch(() => null),
                    fetchGamesHistory(20).catch(() => ({ games: [] })),
                ]);
                setGames(gamesRes.rows as BlockchainGameState[]);
                setRtp(rtpData);
                setHistory(historyData.games);
            } catch (err) {
                console.error('[AdminDashboard] Erro ao carregar dados:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, [session]);

    if (!session) { setLoading(false); return null; }

    const activeGames = games.filter(g =>
        g.status === 'funding' || g.status === 'locked' || g.status === 'drawing'
    );
    const totalPrizePool = games.reduce((sum, g) => {
        const pp = g.total_wagered as unknown as ExtendedAsset;
        const qty = parseFloat(pp.quantity) || 0;
        return sum + qty;
    }, 0);
    const archivedCount = games.filter(g => g.status === 'archived').length;
    const abortedCount = games.filter(g => g.status === 'aborted').length;

    const KPI_CARDS = [
        { label: t('admin.dash_kpi_total'), value: games.length, color: 'var(--cb-info)' },
        { label: t('admin.dash_kpi_active'), value: activeGames.length, color: 'var(--cb-success)' },
        { label: t('admin.dash_kpi_archived'), value: archivedCount, color: 'var(--cb-brand)' },
        { label: t('admin.dash_kpi_cancelled'), value: abortedCount, color: 'var(--cb-danger)' },
        { label: t('admin.dash_kpi_prize'), value: totalPrizePool.toFixed(2), suffix: 'WAX', color: 'var(--cb-accent)' },
        { label: t('admin.dash_kpi_rtp'), value: rtp?.avg_rtp_display ?? '--', color: 'var(--cb-info)' },
    ];

    return (
        <div>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('admin.dash_subtitle')}</p>

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-8">
                    <span className="cb-spinner w-5 h-5" />
                    <span>{t('admin.dash_loading')}</span>
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))' }}>
                        {KPI_CARDS.map((kpi, i) => (
                            <div key={i} className="cb-card p-4 flex flex-col gap-1">
                                <span className="text-xs text-[--cb-text-tertiary] uppercase tracking-wider">{kpi.label}</span>
                                <span className="text-2xl font-bold font-mono" style={{ color: kpi.color }}>
                                    {kpi.value}
                                    {kpi.suffix && <span className="text-sm text-[--cb-text-tertiary] ml-1">{kpi.suffix}</span>}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Jogos Recentes */}
                    <h3 className="text-sm font-semibold text-[--cb-text-secondary] uppercase tracking-wide mb-3">
                        {t('admin.dash_recent')}
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[--cb-text-tertiary] border-b border-[--cb-border-default]">
                                    <th className="text-left py-2 pr-4 font-medium">{t('admin.dash_col_id')}</th>
                                    <th className="text-left py-2 pr-4 font-medium">{t('admin.dash_col_status')}</th>
                                    <th className="text-right py-2 pr-4 font-medium">{t('admin.dash_col_wagered')}</th>
                                    <th className="text-right py-2 pr-4 font-medium">{t('admin.dash_col_paid')}</th>
                                    <th className="text-right py-2 font-medium">{t('admin.dash_col_rtp')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(g => (
                                    <tr key={g.game_id} className="border-b border-[--cb-border-default] text-[--cb-text-primary]">
                                        <td className="py-2 pr-4 font-mono text-xs">{g.game_id}</td>
                                        <td className="py-2 pr-4">
                                            <span className={`cb-badge ${
                                                g.status === 'archived' ? 'cb-badge-success' :
                                                g.status === 'aborted' ? 'cb-badge-danger' :
                                                g.status === 'funding' ? 'cb-status-funding' :
                                                'cb-badge-neutral'
                                            }`}>{g.status}</span>
                                        </td>
                                        <td className="py-2 pr-4 text-right font-mono">{(Number(g.total_wagered)).toFixed(2)}</td>
                                        <td className="py-2 pr-4 text-right font-mono">{(Number(g.total_paid_out)).toFixed(2)}</td>
                                        <td className="py-2 text-right font-mono">{(Number(g.rtp_pct) * 100).toFixed(2)}%</td>
                                    </tr>
                                ))}
                                {history.length === 0 && (
                                    <tr><td colSpan={5} className="py-4 text-center text-[--cb-text-tertiary]">{t('admin.dash_empty_ledger')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
