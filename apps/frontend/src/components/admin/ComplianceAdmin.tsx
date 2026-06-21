import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, TriangleAlert, Check } from 'lucide-react';
import { fetchRtpReport, fetchGamesHistory, type RtpReport, type GameHistoryEntry } from '../../services/api';

export default function ComplianceAdmin() {
    const { t } = useTranslation();
    const [rtp, setRtp] = useState<RtpReport | null>(null);
    const [history, setHistory] = useState<GameHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState(30);
    const [syncing, setSyncing] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [rtpData, historyData] = await Promise.all([
                fetchRtpReport(period),
                fetchGamesHistory(100),
            ]);
            setRtp(rtpData);
            setHistory(historyData.games);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.compliance_error_load'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [period]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/v1/admin/ledger/sync', { method: 'POST' });
            if (!res.ok) throw new Error(await res.text());
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.compliance_error_sync'));
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div>
            <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
                <div>
                    <p className="text-sm text-[--cb-text-tertiary">{t('admin.compliance_desc')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <select className="cb-input text-sm py-1" value={period} onChange={e => setPeriod(Number(e.target.value))}>
                        <option value={7}>{t('admin.compliance_period_7')}</option>
                        <option value={30}>{t('admin.compliance_period_30')}</option>
                        <option value={90}>{t('admin.compliance_period_90')}</option>
                    </select>
                    <button className="cb-btn cb-btn-secondary text-sm" onClick={handleSync} disabled={syncing}>
                        {syncing ? t('common.syncing') : t('admin.compliance_sync')}
                    </button>
                </div>
            </div>

            {error && (
                <div className="cb-alert cb-alert-error mb-4">
                    <span><TriangleAlert className="size-4 shrink-0" /> {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm"><X className="size-4 shrink-0" /></button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4"><span className="cb-spinner w-4 h-4" /><span>{t('admin.compliance_loading')}</span></div>
            ) : (
                <>
                    {rtp && (
                        <div className="cb-card p-4 mb-6">
                            <h3 className="text-sm font-semibold text-[--cb-text-secondary] uppercase tracking-wide mb-3">{t('admin.compliance_rtp_title', { period })}</h3>
                            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))' }}>
                                {[
                                    { label: t('admin.compliance_total_games'), value: rtp.total_games },
                                    { label: t('admin.compliance_total_wagered'), value: `${rtp.total_wagered.toFixed(2)} ${rtp.currency}` },
                                    { label: t('admin.compliance_total_paid'), value: `${rtp.total_paid_out.toFixed(2)} ${rtp.currency}` },
                                    { label: t('admin.compliance_rtp_label'), value: rtp.avg_rtp_display, highlight: true },
                                    { label: t('admin.compliance_ggr'), value: rtp.total_ggr.toFixed(2) },
                                    { label: t('admin.compliance_ggr_pct'), value: rtp.avg_ggr_display },
                                ].map((s, i) => (
                                    <div key={i} className="bg-[--cb-bg-surface] p-3 rounded-lg">
                                        <span className="text-xs text-[--cb-text-tertiary] block">{s.label}</span>
                                        <span className={`text-lg font-bold font-mono ${s.highlight ? 'text-[--cb-success]' : 'text-[--cb-text-primary]'}`}>
                                            {s.value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-[--cb-text-tertiary] mt-3">{t('admin.compliance_generated_at', { date: new Date(rtp.generated_at).toLocaleString('pt-BR') })}</p>
                        </div>
                    )}

                    <h3 className="text-sm font-semibold text-[--cb-text-secondary] uppercase tracking-wide mb-3">
                        {t('admin.compliance_history_title', { count: history.length })}
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[--cb-text-tertiary] border-b border-[--cb-border-default]">
                                    <th className="text-left py-2 pr-4 font-medium">{t('admin.compliance_col_game')}</th>
                                    <th className="text-left py-2 pr-4 font-medium">{t('admin.compliance_col_status')}</th>
                                    <th className="text-right py-2 pr-4 font-medium">{t('admin.compliance_col_wagered')}</th>
                                    <th className="text-right py-2 pr-4 font-medium">{t('admin.compliance_col_paid')}</th>
                                    <th className="text-right py-2 font-medium">{t('admin.compliance_col_rtp')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(g => (
                                    <tr key={g.game_id} className="border-b border-[--cb-border-default] text-[--cb-text-primary]">
                                        <td className="py-2 pr-4 font-mono text-xs">{g.game_id}</td>
                                        <td className="py-2 pr-4">
                                            <span className={`cb-badge text-xs ${
                                                g.status === 'archived' ? 'cb-badge-success' :
                                                g.status === 'aborted' ? 'cb-badge-danger' :
                                                'cb-badge-neutral'
                                            }`}>{g.status}</span>
                                        </td>
                                        <td className="py-2 pr-4 text-right font-mono">{g.total_wagered.toFixed(2)}</td>
                                        <td className="py-2 pr-4 text-right font-mono">{g.total_paid_out.toFixed(2)}</td>
                                        <td className="py-2 text-right font-mono">{(g.rtp_pct * 100).toFixed(2)}%</td>
                                    </tr>
                                ))}
                                {history.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-[--cb-text-tertiary]">{t('admin.compliance_empty')}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
