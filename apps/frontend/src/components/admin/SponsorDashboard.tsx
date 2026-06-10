import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session } from '@wharfkit/session';
import { fetchCampaigns, closeCampaign, type BlockchainCampaign } from '../../services/api';

interface SponsorDashboardProps { session?: Session }

export default function SponsorDashboard(_props: SponsorDashboardProps) {
    const { t } = useTranslation();
    const [campaigns, setCampaigns] = useState<BlockchainCampaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchCampaigns();
            setCampaigns(data.campaigns);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.campaigns_error_load'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleClose = async (id: string) => {
        if (!confirm(t('admin.campaigns_confirm_close', { id }))) return;
        try {
            await closeCampaign(id);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.campaigns_error_close'));
        }
    };

    const BudgetBar = ({ used, total }: { used: number; total: number }) => {
        const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
        return (
            <div className="w-full bg-[--cb-bg-surface] rounded-full h-2 mt-1">
                <div className="h-full rounded-full bg-gradient-to-r from-[--cb-brand] to-[--cb-accent]" style={{ width: `${pct}%` }} />
            </div>
        );
    };

    return (
        <div>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('admin.campaigns_desc')}</p>

            {error && (
                <div className="cb-alert cb-alert-error mb-4">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4"><span className="cb-spinner w-4 h-4" /><span>{t('admin.campaigns_loading')}</span></div>
            ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(26rem, 1fr))' }}>
                    {campaigns.map(c => {
                        const budget = parseFloat(c.budget.quantity) || 0;
                        const remaining = parseFloat(c.remaining.quantity) || 0;
                        const used = budget - remaining;
                        return (
                            <div key={c.campaign_id} className="cb-card p-4 flex flex-col gap-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className="font-bold text-[--cb-text-primary]">Campanha #{c.campaign_id}</span>
                                        <span className={`cb-badge ml-2 text-xs ${c.status === 'active' ? 'cb-badge-success' : c.status === 'closed' ? 'cb-badge-danger' : 'cb-badge-neutral'}`}>{c.status}</span>
                                    </div>
                                    {c.status !== 'closed' && (
                                        <button className="text-xs text-[--cb-danger] hover:underline" onClick={() => handleClose(c.campaign_id)}>{t('admin.campaigns_close')}</button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="bg-[--cb-bg-surface] p-2 rounded">
                                        <span className="text-[--cb-text-tertiary] block">{t('admin.campaigns_sponsor')}</span>
                                        <span className="font-mono text-[--cb-text-primary]">{c.sponsor}</span>
                                    </div>
                                    <div className="bg-[--cb-bg-surface] p-2 rounded">
                                        <span className="text-[--cb-text-tertiary] block">{t('admin.campaigns_payout')}</span>
                                        <span className="font-mono text-[--cb-text-primary]">{c.payout_per_game.quantity}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs text-[--cb-text-tertiary]">
                                        <span>{t('admin.campaigns_budget')}<strong className="text-[--cb-text-primary]">{c.budget.quantity}</strong></span>
                                        <span>{t('admin.campaigns_remaining')}<strong className="text-[--cb-text-primary]">{c.remaining.quantity}</strong></span>
                                    </div>
                                    <BudgetBar used={used} total={budget} />
                                </div>
                                <span className="text-xs text-[--cb-text-tertiary]">{t('admin.campaigns_leftover')}{c.leftover_policy}</span>
                            </div>
                        );
                    })}
                    {campaigns.length === 0 && <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.campaigns_empty')}</p>}
                </div>
            )}
        </div>
    );
}
